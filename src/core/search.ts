import type { Embedder } from "../embed/types.js";
import type { Db } from "./db.js";
import { rowToMemory, whereClause, type Filters, type MemoryRow } from "./rows.js";
import type { Memory } from "./types.js";
import { embedderState, knn, mismatchMessage, scopeKey } from "./vectors.js";

export type SearchMode = "hybrid" | "semantic" | "text";

export interface SearchOptions extends Filters {
  query: string;
  mode?: SearchMode;
  limit?: number;
}

export interface SearchHit {
  memory: Memory;
  score: number;
  sources: ("text" | "semantic")[];
}

export interface SearchResult {
  hits: SearchHit[];
  modeUsed: SearchMode;
  note?: string;
}

const RRF_K = 60;
const RECENCY_HALF_LIFE_DAYS = 60;

/** Importance 1..5 scales the fused score by 0.9..1.3, and fresh memories get up to +10%. */
function boost(m: Memory): number {
  const ageDays = (Date.now() - Date.parse(m.updatedAt)) / 86_400_000;
  return (0.8 + 0.1 * m.importance) * (1 + 0.1 * Math.pow(0.5, Math.max(ageDays, 0) / RECENCY_HALF_LIFE_DAYS));
}

/** Turns free text into a safe FTS5 query: quoted tokens joined with OR. */
export function toFtsQuery(text: string): string | null {
  const tokens = text.match(/[\p{L}\p{N}]+/gu);
  return tokens?.length ? tokens.map((t) => `"${t}"`).join(" OR ") : null;
}

function textSearch(db: Db, query: string, f: Filters, n: number): Memory[] {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  const { sql, params } = whereClause(f);
  const rows = db
    .prepare(
      `SELECT m.* FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
       WHERE memories_fts MATCH @fts AND ${sql} ORDER BY bm25(memories_fts) LIMIT @n`,
    )
    .all({ ...params, fts, n }) as MemoryRow[];
  return rows.map(rowToMemory);
}

async function semanticSearch(db: Db, embedder: Embedder, query: string, f: Filters, n: number): Promise<Memory[]> {
  const [vec] = await embedder.embed([query], "query");
  if (!vec) return [];
  const scope = f.scope ?? "both";
  const keys: (string | null)[] =
    scope === "all" ? [null] : scope === "global" ? ["global"] : scope === "project" ? (f.project ? [scopeKey("project", f.project)] : []) : f.project ? ["global", scopeKey("project", f.project)] : ["global"];
  const ids = keys.flatMap((k) => knn(db, vec, n, k)).sort((a, b) => a.distance - b.distance).map((r) => Number(r.id));
  if (!ids.length) return [];
  const { sql, params } = whereClause({ ...f, scope: "all" });
  const rows = db
    .prepare(`SELECT m.* FROM memories m WHERE m.id IN (SELECT value FROM json_each(@ids)) AND ${sql}`)
    .all({ ...params, ids: JSON.stringify(ids) }) as MemoryRow[];
  const byId = new Map(rows.map((r) => [r.id, rowToMemory(r)]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

export async function search(db: Db, embedder: Embedder | null, opts: SearchOptions): Promise<SearchResult> {
  const limit = Math.min(opts.limit ?? 10, 50);
  const pool = Math.max(limit * 5, 50);
  const wanted = opts.mode ?? "hybrid";
  let mode: SearchMode = wanted;
  let note: string | undefined;

  if (wanted !== "text") {
    const state = embedder ? embedderState(db, embedder) : null;
    if (!embedder) (mode = "text"), (note = "No embedder configured, used text search.");
    else if (state?.status === "uninitialized") (mode = "text"), (note = "No vectors yet, used text search.");
    else if (state?.status === "mismatch") (mode = "text"), (note = mismatchMessage(state, embedder));
  }

  let text: Memory[] = [];
  let semantic: Memory[] = [];
  if (mode !== "semantic") text = textSearch(db, opts.query, opts, pool);
  if (mode !== "text" && embedder) {
    try {
      semantic = await semanticSearch(db, embedder, opts.query, opts, pool);
    } catch (err) {
      if (mode === "semantic") throw err;
      mode = "text";
      note = `Semantic search failed (${(err as Error).message}), used text search.`;
    }
  }

  const fused = new Map<number, SearchHit>();
  const add = (list: Memory[], source: "text" | "semantic") =>
    list.forEach((memory, rank) => {
      const hit = fused.get(memory.id) ?? { memory, score: 0, sources: [] };
      hit.score += 1 / (RRF_K + rank + 1);
      hit.sources.push(source);
      fused.set(memory.id, hit);
    });
  add(text, "text");
  add(semantic, "semantic");

  const hits = [...fused.values()].map((h) => ({ ...h, score: h.score * boost(h.memory) })).sort((a, b) => b.score - a.score).slice(0, limit);
  return { hits, modeUsed: mode, note };
}
