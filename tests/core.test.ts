import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findGitRoot, requireProject, resolveProject } from "../src/core/project.js";
import { toFtsQuery } from "../src/core/search.js";
import { newStore } from "./helpers.js";

describe("memories", () => {
  it("saves with sensible defaults", async () => {
    const store = newStore();
    const { memory, embedded, warning } = await store.add({ content: "  Use pnpm, not npm  " });
    expect(memory).toMatchObject({ scope: "global", project: null, category: "context", importance: 3, pinned: false, content: "Use pnpm, not npm" });
    expect(embedded).toBe(false);
    expect(warning).toMatch(/No embedder/);
  });

  it("rejects bad input", async () => {
    const store = newStore();
    await expect(store.add({ content: "   " })).rejects.toThrow(/empty/);
    await expect(store.add({ content: "x", importance: 9 })).rejects.toThrow(/1 to 5/);
    await expect(store.add({ content: "x", scope: "project" })).rejects.toThrow(/project name/);
    await expect(store.add({ content: "x", category: "has space!" })).rejects.toThrow(/Invalid category/);
    await expect(store.add({ content: "x".repeat(8001) })).rejects.toThrow(/too long/);
  });

  it("creates custom categories and counts them", async () => {
    const store = newStore();
    await store.add({ content: "a", category: "Dev Ops" });
    await store.add({ content: "b", category: "dev-ops" });
    await store.add({ content: "c", category: "decision" });
    const cats = Object.fromEntries(store.categories().map((c) => [c.name, c]));
    expect(cats["dev-ops"]).toMatchObject({ count: 2, builtin: false });
    expect(cats["decision"]).toMatchObject({ count: 1, builtin: true });
    expect(Object.keys(cats)).toEqual(expect.arrayContaining(["decision", "preference", "fact", "error", "todo", "context"]));
  });

  it("keeps global and project memories apart", async () => {
    const store = newStore();
    await store.add({ content: "global one" });
    await store.add({ content: "alpha one", project: "alpha" });
    await store.add({ content: "beta one", project: "beta" });
    const texts = (opts: Parameters<typeof store.list>[0]) => store.list(opts).items.map((m) => m.content).sort();
    expect(texts({ scope: "both", project: "alpha" })).toEqual(["alpha one", "global one"]);
    expect(texts({ scope: "project", project: "alpha" })).toEqual(["alpha one"]);
    expect(texts({ scope: "global" })).toEqual(["global one"]);
    expect(texts({ scope: "all" })).toEqual(["alpha one", "beta one", "global one"]);
    expect(texts({ scope: "both" })).toEqual(["global one"]);
    expect(texts({ scope: "project" })).toEqual([]);
    expect(store.projects()).toEqual([{ project: "alpha", count: 1 }, { project: "beta", count: 1 }]);
  });

  it("updates and deletes, keeping the text index in sync", async () => {
    const store = newStore();
    const { memory } = await store.add({ content: "The staging server is called falcon" });
    expect((await store.search({ query: "falcon" })).hits).toHaveLength(1);
    await store.update(memory.id, { content: "The staging server is called heron", importance: 5, tags: ["Infra", "infra"] });
    expect((await store.search({ query: "falcon" })).hits).toHaveLength(0);
    const hit = (await store.search({ query: "heron" })).hits[0]!.memory;
    expect(hit).toMatchObject({ importance: 5, tags: ["infra"] });
    expect(store.remove(memory.id)).toBe(true);
    expect(store.remove(memory.id)).toBe(false);
    expect((await store.search({ query: "heron" })).hits).toHaveLength(0);
    expect(await store.update(999, { content: "nope" })).toBeNull();
  });

  it("moves a memory between scopes", async () => {
    const store = newStore();
    const { memory } = await store.add({ content: "move me", project: "alpha" });
    const moved = (await store.update(memory.id, { scope: "global" }))!.memory;
    expect(moved).toMatchObject({ scope: "global", project: null });
    expect(store.list({ scope: "project", project: "alpha" }).total).toBe(0);
  });

  it("builds session context from pinned and important memories only", async () => {
    const store = newStore();
    await store.add({ content: "boring note", importance: 2 });
    await store.add({ content: "important", importance: 4 });
    await store.add({ content: "pinned low", importance: 1, pinned: true });
    await store.add({ content: "other project", importance: 5, project: "beta" });
    const ctx = store.context({ project: "alpha" }).map((m) => m.content);
    expect(ctx).toEqual(["pinned low", "important"]);
  });
});

describe("text search", () => {
  let store: ReturnType<typeof newStore>;
  beforeEach(async () => {
    store = newStore();
    await store.add({ content: "We are deploying the API to Cloudflare Workers", category: "decision", importance: 2 });
    await store.add({ content: "Deploy script lives in scripts/deploy.sh", category: "fact", importance: 5, tags: ["release"] });
    await store.add({ content: "Alpha only deploy note", project: "alpha" });
  });

  it("matches word stems and tags", async () => {
    expect((await store.search({ query: "deploy", mode: "text" })).hits).toHaveLength(2);
    expect((await store.search({ query: "release", mode: "text" })).hits).toHaveLength(1);
  });

  it("applies scope, category and importance filters", async () => {
    expect((await store.search({ query: "deploy", mode: "text", scope: "all" })).hits).toHaveLength(3);
    expect((await store.search({ query: "deploy", mode: "text", project: "alpha" })).hits).toHaveLength(3);
    expect((await store.search({ query: "deploy", mode: "text", category: "fact" })).hits).toHaveLength(1);
    expect((await store.search({ query: "deploy", mode: "text", minImportance: 4 })).hits).toHaveLength(1);
  });

  it("ranks higher importance first when the text matches equally", async () => {
    const s = newStore();
    await s.add({ content: "retry failed uploads", importance: 1 });
    await s.add({ content: "retry failed uploads", importance: 5 });
    const hits = (await s.search({ query: "retry uploads" })).hits;
    expect(hits.map((h) => h.memory.importance)).toEqual([5, 1]);
  });

  it("survives punctuation and empty queries", async () => {
    expect(toFtsQuery('foo" AND (bar*')).toBe('"foo" OR "AND" OR "bar"');
    expect(toFtsQuery("?!")).toBeNull();
    expect((await store.search({ query: '"unbalanced (' })).hits).toEqual([]);
    expect((await store.search({ query: "???" })).hits).toEqual([]);
  });

  it("falls back to text mode with a note when there is no embedder", async () => {
    const r = await store.search({ query: "deploy", mode: "hybrid" });
    expect(r.modeUsed).toBe("text");
    expect(r.note).toMatch(/No embedder/);
  });
});

describe("project resolution", () => {
  const saved = process.env.MEMI_PROJECT;
  beforeEach(() => delete process.env.MEMI_PROJECT);
  afterEach(() => (saved === undefined ? delete process.env.MEMI_PROJECT : (process.env.MEMI_PROJECT = saved)));

  it("prefers explicit, then env, then git, then agent", () => {
    const root = mkdtempSync(join(tmpdir(), "memi-git-"));
    mkdirSync(join(root, ".git"));
    const nested = join(root, "src", "deep");
    mkdirSync(nested, { recursive: true });
    expect(findGitRoot(nested)).toBe(root);

    expect(resolveProject({ project: "x", agent: "bot", cwd: nested })).toEqual({ project: "x", source: "explicit" });
    process.env.MEMI_PROJECT = "from-env";
    expect(resolveProject({ agent: "bot", cwd: nested })).toEqual({ project: "from-env", source: "env" });
    delete process.env.MEMI_PROJECT;
    expect(resolveProject({ agent: "bot", cwd: nested })?.source).toBe("git");
    expect(resolveProject({ agent: "bot", cwd: nested })?.project).toBe(root.split("/").pop());
  });

  it("falls back to the agent name when there is no git repo", () => {
    const plain = mkdtempSync(join(tmpdir(), "memi-plain-"));
    expect(resolveProject({ agent: "claude", cwd: plain })).toEqual({ project: "agent:claude", source: "agent" });
    expect(resolveProject({ cwd: plain })).toBeNull();
    expect(() => requireProject({ cwd: plain })).toThrow(/MEMI_AGENT/);
  });
});
