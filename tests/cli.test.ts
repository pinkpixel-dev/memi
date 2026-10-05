import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ENTRY, DEAD_OLLAMA, MODEL_A, NODE_ARGS, childEnv, ollamaHas, tempDir } from "./helpers.js";

const hasNomic = await ollamaHas(MODEL_A);

/** Each test gets its own home and a non-git working directory. */
function sandbox(env: Record<string, string> = { MEMI_OLLAMA_URL: DEAD_OLLAMA }) {
  const home = tempDir("home");
  const cwd = tempDir("cwd");
  const run = (...args: string[]) => {
    const r = spawnSync(process.execPath, [...NODE_ARGS, CLI_ENTRY, ...args], {
      cwd,
      env: childEnv(home, env),
      encoding: "utf8",
      input: "",
      timeout: 120_000,
    });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  return { home, cwd, run };
}

describe("CLI", () => {
  it("reports its version from package.json", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8"));
    expect(sandbox().run("--version").out.trim()).toBe(pkg.version);
  });

  it("adds, searches, lists, updates and forgets, even with the embedder down", () => {
    const { run } = sandbox();
    const added = run("add", "Staging", "uses", "the", "falcon", "server", "-c", "fact", "-i", "4", "-t", "infra,ci", "--pin");
    expect(added.code).toBe(0);
    expect(added.out).toMatch(/Saved #1 \(global, fact, importance 4\)/);
    expect(added.err).toMatch(/Saved without a vector/);

    const search = run("search", "falcon", "--json");
    const parsed = JSON.parse(search.out);
    expect(parsed.hits[0].memory).toMatchObject({ id: 1, pinned: true, tags: ["infra", "ci"], importance: 4 });
    expect(parsed.modeUsed).toBe("text");

    expect(run("list", "--pinned").out).toMatch(/1 of 1/);
    expect(run("list", "-c", "todo").out).toBe("No memories found.\n");

    const updated = run("update", "1", "--content", "Staging uses heron", "--unpin", "-i", "2");
    expect(updated.out).toMatch(/importance 2 \| global[\s\S]*Staging uses heron/);
    expect(updated.out).not.toMatch(/pinned/);
    expect(run("update", "99", "-i", "2")).toMatchObject({ code: 1, err: "memi: No memory with id 99.\n" });

    expect(run("categories").out).toMatch(/fact \(1\)/);
    expect(run("forget", "1", "--yes").out).toMatch(/Deleted #1/);
    expect(run("search", "heron").out).toBe("No matching memories.\n");
  });

  it("asks before deleting and refuses when there is no terminal to ask in", () => {
    const { run } = sandbox();
    run("add", "keep me");
    const r = run("forget", "1");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/Pass --yes/);
    expect(run("list").out).toMatch(/keep me/);
  });

  it("uses the agent name as the project when there is no git repo", () => {
    const { run } = sandbox({ MEMI_OLLAMA_URL: DEAD_OLLAMA, MEMI_AGENT: "pinkbot" });
    expect(run("add", "belongs to the agent").out).toMatch(/project agent:pinkbot/);
    expect(run("add", "applies everywhere", "--global").out).toMatch(/\(global,/);
    expect(run("list", "--scope", "project").out).toMatch(/belongs to the agent/);
    expect(run("list", "--scope", "global").out).not.toMatch(/belongs to the agent/);
  });

  it("detects the git repo name as the project", () => {
    const { cwd, run } = sandbox();
    spawnSync("git", ["init", "-q"], { cwd });
    const name = cwd.split("/").pop()!;
    expect(run("add", "repo scoped").out).toContain(`project ${name}`);
  });

  it("validates input with a one-line error and exit code 1", () => {
    const { run } = sandbox();
    for (const args of [["add", "x", "-i", "9"], ["add", "x", "-c", "bad name!"], ["search", "x", "--scope", "nope"], ["add", "x", "-i", "abc"]]) {
      const r = run(...args);
      expect(r.code, args.join(" ")).toBe(1);
      expect(r.err, args.join(" ")).toMatch(/^memi: /);
      expect(r.err).not.toMatch(/\n\s+at /);
    }
  });

  it("shows and changes settings, and rejects bad ones", () => {
    const { home, run } = sandbox({});
    expect(run("config").out).toMatch(/embedder.provider\s+ollama[\s\S]*embedder.model\s+nomic-embed-text/);
    expect(run("config", "set", "agent", "bot").code).toBe(0);
    expect(JSON.parse(readFileSync(join(home, "config.json"), "utf8")).agent).toBe("bot");
    expect(run("config", "set", "embedder.provider", "nope")).toMatchObject({ code: 1, err: "memi: embedder.provider must be one of: ollama, openai\n" });
    expect(run("config", "set", "ui.port", "99999").code).toBe(1);
    expect(run("config", "set", "colour", "red").err).toMatch(/Unknown key/);
  });

  it("switching to OpenAI clears the old model and never stores the API key", () => {
    const { home, run } = sandbox({ MEMI_OLLAMA_URL: DEAD_OLLAMA, OPENAI_API_KEY: "sk-test-not-real" });
    run("config", "set", "embedder.model", "some-ollama-model");
    run("config", "set", "embedder.provider", "openai");
    const file = readFileSync(join(home, "config.json"), "utf8");
    expect(JSON.parse(file).embedder).toEqual({ provider: "openai" });
    expect(file).not.toMatch(/sk-test/);
    const shown = run("config").out;
    expect(shown).toMatch(/embedder.model\s+text-embedding-3-small/);
    expect(shown).toMatch(/OPENAI_API_KEY\s+set/);
    expect(shown).not.toMatch(/sk-test/);
  });

  it("doctor fails with a clear line when the embedder is unreachable", () => {
    const { run } = sandbox();
    const r = run("doctor");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/fail\s+Could not reach http:\/\/127\.0\.0\.1:1/);
    expect(r.out).toMatch(/ok\s+Database at/);
  });

  it("reindex fails cleanly and changes nothing when the embedder is unreachable", () => {
    const { run } = sandbox();
    run("add", "one");
    const r = run("reindex", "--yes");
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^[\s\S]*memi: Could not reach/m);
    expect(r.err).not.toMatch(/\n\s+at /);
    expect(run("list").out).toMatch(/1 of 1/);
    const noConfirm = run("reindex");
    expect(noConfirm.err).toMatch(/Pass --yes/);
  });
});

describe("memi ui", () => {
  /** Starts `memi ui` and resolves once it has printed its URL. */
  function startUi(extraArgs: string[], env: Record<string, string>, home: string, cwd: string) {
    const child = spawn(process.execPath, [...NODE_ARGS, CLI_ENTRY, "ui", ...extraArgs], { cwd, env: childEnv(home, env) });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
    const url = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no URL printed. stdout: ${out} stderr: ${err}`)), 30_000);
      child.stdout.on("data", () => {
        const m = out.match(/running at (http:\/\/localhost:\d+)/);
        if (m) (clearTimeout(timer), resolve(m[1]!));
      });
      exited.then(() => (clearTimeout(timer), reject(new Error(`exited early. stderr: ${err}`))));
    });
    return { child, url, exited, err: () => err };
  }

  it("serves the page and API, then shuts down cleanly on Ctrl+C", async () => {
    const home = tempDir("home");
    const cwd = tempDir("cwd");
    spawnSync(process.execPath, [...NODE_ARGS, CLI_ENTRY, "add", "from the cli", "--global"], { cwd, env: childEnv(home, { MEMI_OLLAMA_URL: DEAD_OLLAMA }), input: "" });

    const ui = startUi(["--port", "0"], { MEMI_OLLAMA_URL: DEAD_OLLAMA }, home, cwd);
    const url = await ui.url;
    expect((await fetch(url)).status).toBe(200);
    const list = await (await fetch(`${url}/api/memories`)).json();
    expect(list.items.map((m: { content: string }) => m.content)).toEqual(["from the cli"]);

    ui.child.kill("SIGINT");
    expect(await ui.exited).toBe(0);
    await expect(fetch(url, { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
  });

  it("says so clearly when the port is taken", async () => {
    const home = tempDir("home");
    const cwd = tempDir("cwd");
    const first = startUi(["--port", "0"], { MEMI_OLLAMA_URL: DEAD_OLLAMA }, home, cwd);
    const port = new URL(await first.url).port;

    const second = startUi(["--port", port], { MEMI_OLLAMA_URL: DEAD_OLLAMA }, home, cwd);
    await expect(second.url).rejects.toThrow();
    expect(await second.exited).toBe(1);
    expect(second.err()).toBe(`memi: Port ${port} is already in use. Pick another with --port.\n`);

    first.child.kill("SIGINT");
    await first.exited;
  });

  it("rejects a bad port with one clean line", () => {
    const { run } = sandbox();
    const r = run("ui", "--port", "abc");
    expect(r).toMatchObject({ code: 1, err: "memi: Port must be a whole number.\n" });
  });
});

describe.skipIf(!hasNomic)("CLI with real embeddings", () => {
  it("finds a paraphrase, then warns and rebuilds when the embedder is changed", () => {
    const { home, run } = sandbox({});
    expect(run("add", "The user prefers tabs over spaces for indentation", "--global").code).toBe(0);
    expect(run("add", "Deploys go through GitHub Actions to Cloudflare").code).toBe(0);
    expect(run("search", "coding whitespace convention", "--scope", "all", "-n", "1").out).toMatch(/tabs over spaces/);
    expect(run("doctor").out).toMatch(/ok\s+Vector index matches \(ollama\/nomic-embed-text, 768 dimensions\)/);

    // Point the config at another model name. Even though it is not pulled, the mismatch is detected before any embedding.
    const set = run("config", "set", "embedder.model", "does-not-exist");
    expect(set.err).toMatch(/Warning: The embedder changed from ollama\/nomic-embed-text \(768 dims\)/);
    expect(set.err).toMatch(/different dimensions/);
    expect(set.err).toMatch(/memories themselves are kept/);
    expect(existsSync(join(home, "memi.db"))).toBe(true);

    const search = run("search", "tabs", "--scope", "all");
    expect(search.out).toMatch(/tabs over spaces/);
    expect(search.err).toMatch(/Note: The embedder changed/);

    // Back to the stored model: no reindex needed.
    run("config", "set", "embedder.model", "nomic-embed-text");
    expect(run("doctor").out).toMatch(/ok\s+Vector index matches/);
    expect(run("reindex", "--yes").out).toMatch(/Rebuilt 2 vectors with ollama\/nomic-embed-text \(768 dimensions\)/);
    expect(run("reindex", "--missing").out).toMatch(/Embedded 0 memories/);
  });
});
