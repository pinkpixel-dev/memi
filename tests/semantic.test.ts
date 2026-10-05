import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/core/memories.js";
import { embedderState } from "../src/core/vectors.js";
import { MODEL_A, MODEL_B, newStore, ollama, ollamaHas } from "./helpers.js";

const available = await ollamaHas(MODEL_A);
const hasSecondModel = await ollamaHas(MODEL_B);
if (!available) console.warn(`SKIPPING semantic tests: Ollama is not reachable or ${MODEL_A} is not pulled.`);
if (available && !hasSecondModel) console.warn(`SKIPPING the embedder-switch test: ${MODEL_B} is not pulled (set MEMI_TEST_ALT_MODEL to another model with a different dimension).`);

describe.skipIf(!available)("semantic search (real Ollama)", () => {
  // Cold model loads can take 30s+, so load both once up front.
  beforeAll(async () => {
    await ollama(MODEL_A).embed(["warm up"], "document");
    if (hasSecondModel) await ollama(MODEL_B).embed(["warm up"], "document");
  });

  async function seeded() {
    const store = newStore(ollama(MODEL_A));
    await store.add({ content: "The user prefers tabs over spaces for indentation", category: "preference" });
    await store.add({ content: "Deploys go through GitHub Actions to Cloudflare", category: "fact" });
    await store.add({ content: "Cats are mammals", category: "fact", project: "zoo" });
    return store;
  }

  it("finds a paraphrase that shares no words with the memory", async () => {
    const store = await seeded();
    const query = "coding whitespace convention";
    const text = await store.search({ query, mode: "text" });
    expect(text.hits).toHaveLength(0);

    const semantic = await store.search({ query, mode: "semantic", scope: "all" });
    expect(semantic.modeUsed).toBe("semantic");
    expect(semantic.hits[0]!.memory.content).toMatch(/tabs over spaces/);

    const hybrid = await store.search({ query, scope: "all" });
    expect(hybrid.hits[0]!.memory.content).toMatch(/tabs over spaces/);
    expect(hybrid.hits[0]!.sources).toEqual(["semantic"]);
  });

  it("respects scope and category filters on vector results", async () => {
    const store = await seeded();
    const q = { query: "animals", mode: "semantic" as const };
    expect((await store.search({ ...q, scope: "global" })).hits.map((h) => h.memory.content)).not.toContain("Cats are mammals");
    expect((await store.search({ ...q, scope: "project", project: "zoo" })).hits.map((h) => h.memory.content)).toEqual(["Cats are mammals"]);
    expect((await store.search({ ...q, scope: "all", category: "preference" })).hits.every((h) => h.memory.category === "preference")).toBe(true);
  });

  it("reports near-duplicates when saving, but not merely related memories", async () => {
    const store = await seeded();
    const dup = await store.add({ content: "The user likes tabs rather than spaces for indenting", category: "preference" });
    expect(dup.embedded).toBe(true);
    expect(dup.similar.map((s) => s.memory.content)).toEqual(["The user prefers tabs over spaces for indentation"]);
    const other = await store.add({ content: "Prefers dark mode in every editor", category: "preference" });
    expect(other.similar).toEqual([]);
  });

  it.skipIf(!hasSecondModel)("switching embedders keeps memories, turns semantic search off, and reindex rebuilds the vectors", async () => {
    const a = await seeded();
    expect(a.status()).toMatchObject({ total: 3, vectors: 3, state: { status: "ok", stored: { model: MODEL_A, dimensions: 768 } } });

    // Same database, different embedder: the dimensions no longer match.
    const b = new MemoryStore(a.db, ollama(MODEL_B));
    expect(b.status().state.status).toBe("mismatch");
    expect(b.status().warning).toMatch(/memi reindex/);

    const saved = await b.add({ content: "Saved while mismatched" });
    expect(saved.embedded).toBe(false);
    expect(saved.warning).toMatch(/memi reindex/);
    const fallback = await b.search({ query: "mismatched", scope: "all" });
    expect(fallback.modeUsed).toBe("text");
    expect(fallback.note).toMatch(/memi reindex/);
    expect(fallback.hits).toHaveLength(1);

    const progress: number[] = [];
    const result = await b.reindex((done) => progress.push(done));
    expect(result).toEqual({ count: 4, dimensions: 1024 });
    expect(progress.at(-1)).toBe(4);
    expect(b.list({ scope: "all" }).total).toBe(4);
    expect(b.status()).toMatchObject({ vectors: 4, state: { status: "ok", stored: { model: MODEL_B, dimensions: 1024 } } });

    const after = await b.search({ query: "coding whitespace convention", mode: "semantic", scope: "all" });
    expect(after.hits[0]!.memory.content).toMatch(/tabs over spaces/);
    expect(embedderState(b.db, ollama(MODEL_B)).status).toBe("ok");
  });

  it("saves memories while the embedder is down and backfills them later", async () => {
    const down = newStore(ollama(MODEL_A, "http://127.0.0.1:1"));
    const r = await down.add({ content: "Written while Ollama was off" });
    expect(r.embedded).toBe(false);
    expect(r.warning).toMatch(/--missing/);
    expect(down.list().total).toBe(1);

    const up = new MemoryStore(down.db, ollama(MODEL_A));
    expect(await up.backfill()).toBe(1);
    expect(up.status()).toMatchObject({ total: 1, vectors: 1 });
    expect(await up.backfill()).toBe(0);
  });
});
