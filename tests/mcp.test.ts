import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, describe, expect, it } from "vitest";
import { CLI_ENTRY, DEAD_OLLAMA, MODEL_A, NODE_ARGS, childEnv, ollamaHas, tempDir } from "./helpers.js";

const hasNomic = await ollamaHas(MODEL_A);
const open: Client[] = [];

/** Starts the real server as a child process and connects a real MCP client to it. */
async function connect(env: Record<string, string> = {}, cwd = tempDir("cwd")) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [...NODE_ARGS, CLI_ENTRY, "serve"],
    cwd,
    env: childEnv(tempDir("home"), { MEMI_OLLAMA_URL: DEAD_OLLAMA, ...env }),
    stderr: "ignore",
  });
  const client = new Client({ name: "memi-test", version: "0.0.0" });
  await client.connect(transport);
  open.push(client);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
    return { text, isError: res.isError === true };
  };
  return { client, call };
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

describe("MCP server", () => {
  it("exposes the seven tools with instructions", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["forget", "get_context", "list_categories", "list_memories", "recall", "remember", "update_memory"]);
    expect(client.getInstructions()).toMatch(/get_context/);
    const forget = tools.find((t) => t.name === "forget")!;
    expect(forget.annotations?.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === "recall")!.annotations?.readOnlyHint).toBe(true);
  });

  it("runs the full memory lifecycle, saving even though the embedder is down", async () => {
    const { call } = await connect({ MEMI_AGENT: "testbot" });

    const saved = await call("remember", { content: "Staging deploys use the falcon server", category: "fact", importance: 4, tags: ["infra"] });
    expect(saved.isError).toBe(false);
    expect(saved.text).toMatch(/Saved memory #1 \(project agent:testbot, fact, importance 4\)/);
    expect(saved.text).toMatch(/Saved without a vector/);

    const pinned = await call("remember", { content: "Never force-push to main", pinned: true, importance: 5, scope: "global" });
    expect(pinned.text).toMatch(/global/);

    const found = await call("recall", { query: "falcon" });
    expect(found.text).toMatch(/#1 \| fact \| importance 4 \| project agent:testbot \| tags infra/);
    expect(found.text).toMatch(/Note: .*text search/s);
    expect((await call("recall", { query: "zebra" })).text).toBe("No matching memories.\n\nNote: No vectors yet, used text search.");

    const ctx = await call("get_context");
    expect(ctx.text).toMatch(/Never force-push/);
    expect(ctx.text).toMatch(/falcon/);

    const updated = await call("update_memory", { id: 1, content: "Staging deploys use the heron server", pinned: true });
    expect(updated.text).toMatch(/Updated\.[\s\S]*pinned[\s\S]*heron/);
    expect((await call("recall", { query: "falcon" })).text).toMatch(/^No matching/);

    const list = await call("list_memories", { order: "importance" });
    expect(list.text.startsWith("2 of 2")).toBe(true);
    expect((await call("list_categories")).text).toMatch(/fact \(1\)/);

    expect((await call("forget", { id: 1 })).text).toBe("Deleted memory #1.");
    expect((await call("list_memories", { scope: "all" })).text).toMatch(/^1 of 1/);
  });

  it("returns readable tool errors instead of crashing", async () => {
    const { call } = await connect({ MEMI_AGENT: "testbot" });
    const missing = await call("update_memory", { id: 99, content: "x" });
    expect(missing).toMatchObject({ isError: true });
    expect(missing.text).toMatch(/No memory with id 99/);
    expect((await call("forget", { id: 99 })).isError).toBe(true);
    expect((await call("remember", { content: "x", category: "has space!" })).text).toMatch(/Invalid category/);
    const badImportance = await call("remember", { content: "x", importance: 9 });
    expect(badImportance.isError).toBe(true);
    // The server is still alive afterwards.
    expect((await call("list_categories")).isError).toBe(false);
  });

  it("falls back to global with no git repo and no agent name, and labels the memory with the client name", async () => {
    const { call } = await connect();
    expect((await call("remember", { content: "Plain folder memory" })).text).toMatch(/\(global, context, importance 3\)/);
    expect((await call("list_memories")).text).toMatch(/by memi-test/);
    const noProject = await call("remember", { content: "needs a project", scope: "project" });
    expect(noProject.isError).toBe(true);
    expect(noProject.text).toMatch(/MEMI_AGENT/);
  });

  it("keeps projects apart when given an explicit project name", async () => {
    const { call } = await connect();
    await call("remember", { content: "alpha secret handshake", project: "alpha" });
    await call("remember", { content: "beta secret handshake", project: "beta" });
    const both = await call("recall", { query: "handshake", project: "alpha" });
    expect(both.text).toMatch(/alpha secret/);
    expect(both.text).not.toMatch(/beta secret/);
    expect((await call("recall", { query: "handshake", scope: "all" })).text).toMatch(/beta secret/);
  });
});

describe.skipIf(!hasNomic)("MCP server with real embeddings", () => {
  it("recalls by meaning and flags a near-duplicate", async () => {
    const { call } = await connect({ MEMI_AGENT: "testbot", MEMI_OLLAMA_URL: process.env.MEMI_TEST_OLLAMA_URL ?? "http://localhost:11434" });
    const first = await call("remember", { content: "The user prefers tabs over spaces for indentation", category: "preference", scope: "global" });
    expect(first.text).not.toMatch(/Note:/);
    await call("remember", { content: "Deploys go through GitHub Actions to Cloudflare", category: "fact" });

    const dup = await call("remember", { content: "The user likes tabs rather than spaces for indenting", scope: "global" });
    expect(dup.text).toMatch(/Similar memories already exist/);
    expect(dup.text).toMatch(/prefers tabs over spaces/);

    const found = await call("recall", { query: "coding whitespace convention" });
    expect(found.text.split("\n\n")[0]).toMatch(/tabs/);
    expect(found.text).not.toMatch(/Note:/);
  });
});
