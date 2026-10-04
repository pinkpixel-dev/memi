import type { Embedder } from "../embed/types.js";
import type { Db } from "./db.js";
import type { Memory, Scope } from "./types.js";

export const scopeKey = (scope: Scope, project: string | null) => (scope === "global" ? "global" : `p:${project}`);

const asBlob = (v: number[]) => Buffer.from(new Float32Array(v).buffer);

export function getMeta(db: Db, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}
const setMeta = (db: Db, key: string, value: string) =>
  db.prepare("INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);

export interface StoredEmbedder {
  provider: string;
  model: string;
  dimensions: number;
}

export type EmbedderState =
  | { status: "uninitialized" }
  | { status: "ok"; stored: StoredEmbedder }
  | { status: "mismatch"; stored: StoredEmbedder };

export function embedderState(db: Db, embedder: Embedder): EmbedderState {
  const provider = getMeta(db, "embedder_provider");
  const model = getMeta(db, "embedder_model");
  const dim = Number(getMeta(db, "embedder_dimensions"));
  if (!provider || !model || !dim) return { status: "uninitialized" };
  const stored = { provider, model, dimensions: dim };
  return provider === embedder.provider && model === embedder.model ? { status: "ok", stored } : { status: "mismatch", stored };
}

export const mismatchMessage = (state: Extract<EmbedderState, { status: "mismatch" }>, embedder: Embedder) =>
  `The embedder changed from ${state.stored.provider}/${state.stored.model} (${state.stored.dimensions} dims) ` +
  `to ${embedder.provider}/${embedder.model}. Vectors from different models are not compatible, so semantic search is off ` +
  `until you run \`memi reindex\`. That drops and rebuilds the vector table and re-embeds your saved memories. The memories themselves are kept.`;

function createVecTable(db: Db, dimensions: number) {
  db.exec(
    `CREATE VIRTUAL TABLE memory_vec USING vec0(
       memory_id INTEGER PRIMARY KEY,
       scope_key TEXT PARTITION KEY,
       embedding FLOAT[${Math.trunc(dimensions)}] distance_metric=cosine
     )`,
  );
}

async function probeDimensions(embedder: Embedder): Promise<number> {
  const [vec] = await embedder.embed(["memi dimension probe"], "document");
  if (!vec?.length) throw new Error("The embedder returned an empty vector.");
  return vec.length;
}

/** Creates the vector table on first use. Returns false when the stored embedder does not match. */
export async function ensureVectors(db: Db, embedder: Embedder): Promise<EmbedderState> {
  const state = embedderState(db, embedder);
  if (state.status !== "uninitialized") return state;
  const dimensions = await probeDimensions(embedder);
  db.transaction(() => {
    db.exec("DROP TABLE IF EXISTS memory_vec");
    createVecTable(db, dimensions);
    setMeta(db, "embedder_provider", embedder.provider);
    setMeta(db, "embedder_model", embedder.model);
    setMeta(db, "embedder_dimensions", String(dimensions));
  })();
  return embedderState(db, embedder);
}

export function putVector(db: Db, id: number, key: string, vec: number[]) {
  db.prepare("DELETE FROM memory_vec WHERE memory_id = ?").run(BigInt(id));
  db.prepare("INSERT INTO memory_vec(memory_id, scope_key, embedding) VALUES (?, ?, ?)").run(BigInt(id), key, asBlob(vec));
}

export function deleteVector(db: Db, id: number) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'memory_vec'").get();
  if (exists) db.prepare("DELETE FROM memory_vec WHERE memory_id = ?").run(BigInt(id));
}

export interface Neighbor {
  id: number;
  distance: number;
}

/** Cosine distance KNN. Pass a scope key to search one partition, or null to search all of them. */
export function knn(db: Db, query: number[], k: number, key: string | null): Neighbor[] {
  const sql = key
    ? "SELECT memory_id AS id, distance FROM memory_vec WHERE embedding MATCH ? AND k = ? AND scope_key = ? ORDER BY distance"
    : "SELECT memory_id AS id, distance FROM memory_vec WHERE embedding MATCH ? AND k = ? ORDER BY distance";
  const args = key ? [asBlob(query), k, key] : [asBlob(query), k];
  return db.prepare(sql).all(...args) as Neighbor[];
}

const BATCH = 32;

async function embedAll(embedder: Embedder, memories: Memory[], onProgress?: (done: number, total: number) => void) {
  const out: number[][] = [];
  for (let i = 0; i < memories.length; i += BATCH) {
    const slice = memories.slice(i, i + BATCH);
    out.push(...(await embedder.embed(slice.map((m) => m.content), "document")));
    onProgress?.(Math.min(i + BATCH, memories.length), memories.length);
  }
  return out;
}

/**
 * Drops the vector table, re-embeds every saved memory with the current embedder, and records the new
 * provider, model and dimensions. All embedding happens first, so a failed run changes nothing.
 */
export async function rebuildVectors(
  db: Db,
  embedder: Embedder,
  all: Memory[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ count: number; dimensions: number }> {
  const dimensions = await probeDimensions(embedder);
  const vectors = await embedAll(embedder, all, onProgress);
  db.transaction(() => {
    db.exec("DROP TABLE IF EXISTS memory_vec");
    createVecTable(db, dimensions);
    all.forEach((m, i) => putVector(db, m.id, scopeKey(m.scope, m.project), vectors[i]!));
    setMeta(db, "embedder_provider", embedder.provider);
    setMeta(db, "embedder_model", embedder.model);
    setMeta(db, "embedder_dimensions", String(dimensions));
  })();
  return { count: all.length, dimensions };
}

/** Embeds memories that were saved while the embedder was unavailable. */
export async function embedMissing(db: Db, embedder: Embedder, all: Memory[]): Promise<number> {
  const state = await ensureVectors(db, embedder);
  if (state.status !== "ok") return 0;
  const have = new Set((db.prepare("SELECT memory_id AS id FROM memory_vec").all() as { id: number }[]).map((r) => Number(r.id)));
  const missing = all.filter((m) => !have.has(m.id));
  const vectors = await embedAll(embedder, missing);
  db.transaction(() => missing.forEach((m, i) => putVector(db, m.id, scopeKey(m.scope, m.project), vectors[i]!)))();
  return missing.length;
}
