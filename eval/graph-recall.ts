/**
 * Graph-recall eval: does an entity list, fused in as a third RRF list, rank the right memories higher?
 *
 *   npx tsx eval/graph-recall.ts <copy-of-memi.db> <queries.json>
 *
 * Run it on a copy of the database, never the live one (openDb may seed categories).
 * queries.json is [{ "q": "...", "project": "memi" | null, "relevant": [4] }, ...].
 */
import { readFileSync } from "node:fs";
import { openDb, type Db } from "../src/core/db.js";
import { rowToMemory, whereClause, type Filters, type MemoryRow } from "../src/core/rows.js";
import { RANKING, search, toFtsQuery } from "../src/core/search.js";
import type { Memory } from "../src/core/types.js";
import { knn, scopeKey } from "../src/core/vectors.js";
import { createEmbedder, type Embedder } from "../src/embed/index.js";
import { extractEntities, tokens } from "./entities.js";

interface Query {
  q: string;
  project: string | null;
  relevant: number[];
}

const LIMIT = 10;
const POOL = Math.max(LIMIT * 5, 50);
const RRF_K = 60;

// Same nudge as boost() in src/core/search.ts, which isn't exported.
function boost(m: Memory): number {
  const ageDays = Math.max((Date.now() - Date.parse(m.updatedAt)) / 86_400_000, 0);
  return (1 + RANKING.importance * (m.importance - 3)) * (1 + RANKING.recency * Math.pow(0.5, ageDays / RANKING.recencyHalfLifeDays));
}

function textList(db: Db, query: string, f: Filters): Memory[] {
  const fts = toFtsQuery(query);
  if (!fts) return [];
  const { sql, params } = whereClause(f);
  return (
    db
      .prepare(
        `SELECT m.* FROM memories_fts JOIN memories m ON m.id = memories_fts.rowid
         WHERE memories_fts MATCH @fts AND ${sql} ORDER BY bm25(memories_fts) LIMIT @n`,
      )
      .all({ ...params, fts, n: POOL }) as MemoryRow[]
  ).map(rowToMemory);
}

async function semanticList(db: Db, embedder: Embedder, query: string, f: Filters): Promise<Memory[]> {
  const [vec] = await embedder.embed([query], "query");
  if (!vec) return [];
  const scope = f.scope ?? "both";
  const keys: (string | null)[] =
    scope === "all" ? [null] : f.project ? ["global", scopeKey("project", f.project)] : ["global"];
  const ids = keys.flatMap((k) => knn(db, vec, POOL, k)).sort((a, b) => a.distance - b.distance).map((r) => Number(r.id));
  const { sql, params } = whereClause({ ...f, scope: "all" });
  const rows = db
    .prepare(`SELECT m.* FROM memories m WHERE m.id IN (SELECT value FROM json_each(@ids)) AND ${sql}`)
    .all({ ...params, ids: JSON.stringify(ids) }) as MemoryRow[];
  const byId = new Map(rows.map((r) => [r.id, rowToMemory(r)]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

type EntityIndex = Map<number, string[][]>; // memory id -> entities, each as its token list

function buildIndex(memories: Memory[], withTags: boolean): { index: EntityIndex; idf: Map<string, number> } {
  const index: EntityIndex = new Map();
  const df = new Map<string, number>();
  for (const m of memories) {
    const names = new Set(extractEntities(m.content));
    if (withTags) m.tags.forEach((t) => names.add(t.toLowerCase()));
    const ents = [...names].map(tokens).filter((t) => t.length);
    index.set(m.id, ents);
    new Set(ents.map((t) => t.join(" "))).forEach((k) => df.set(k, (df.get(k) ?? 0) + 1));
  }
  const idf = new Map([...df].map(([k, n]) => [k, Math.log(1 + memories.length / n)]));
  return { index, idf };
}

/** Memories ranked by the summed IDF of entities whose every token appears in the query. */
function graphList(db: Db, query: string, f: Filters, g: { index: EntityIndex; idf: Map<string, number> }): Memory[] {
  const q = new Set(tokens(query));
  const { sql, params } = whereClause(f);
  const rows = (db.prepare(`SELECT m.* FROM memories m WHERE ${sql}`).all(params) as MemoryRow[]).map(rowToMemory);
  return rows
    .map((m) => {
      const matched = new Set((g.index.get(m.id) ?? []).filter((t) => t.every((w) => q.has(w))).map((t) => t.join(" ")));
      return { m, score: [...matched].reduce((s, k) => s + (g.idf.get(k) ?? 0), 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.m.id - b.m.id)
    .slice(0, POOL)
    .map((x) => x.m);
}

function fuse(lists: Memory[][]): number[] {
  const fused = new Map<number, { m: Memory; score: number }>();
  for (const list of lists)
    list.forEach((m, rank) => {
      const hit = fused.get(m.id) ?? { m, score: 0 };
      hit.score += 1 / (RRF_K + rank + 1);
      fused.set(m.id, hit);
    });
  return [...fused.values()]
    .map((h) => ({ id: h.m.id, score: h.score * boost(h.m) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT)
    .map((h) => h.id);
}

function firstRank(ids: number[], relevant: number[]): number | null {
  const i = ids.findIndex((id) => relevant.includes(id));
  return i < 0 ? null : i + 1;
}

const VARIANTS = ["baseline", "graph", "graph+tags"] as const;
type Variant = (typeof VARIANTS)[number];

async function main() {
  const [dbFile, queriesFile] = process.argv.slice(2);
  if (!dbFile || !queriesFile) throw new Error("usage: tsx eval/graph-recall.ts <db-copy> <queries.json>");
  const db = openDb(dbFile);
  const embedder = createEmbedder();
  const queries = JSON.parse(readFileSync(queriesFile, "utf8")) as Query[];
  const all = (db.prepare("SELECT * FROM memories").all() as MemoryRow[]).map(rowToMemory);
  const plain = buildIndex(all, false);
  const tagged = buildIndex(all, true);

  for (const setting of ["all", "project"] as const) {
    const ranks: Record<Variant, (number | null)[]> = { baseline: [], graph: [], "graph+tags": [] };
    const recall5: Record<Variant, number[]> = { baseline: [], graph: [], "graph+tags": [] };
    const changes: string[] = [];

    for (const query of queries) {
      const f: Filters = setting === "all" ? { scope: "all" } : { scope: "both", project: query.project };
      const prod = (await search(db, embedder, { ...f, query: query.q, mode: "hybrid", limit: LIMIT })).hits.map((h) => h.memory.id);
      const text = textList(db, query.q, f);
      const semantic = await semanticList(db, embedder, query.q, f);
      const mine = fuse([text, semantic]);
      if (mine.join() !== prod.join()) throw new Error(`Re-implemented fusion drifted from search() on "${query.q}": ${mine} vs ${prod}`);

      const results: Record<Variant, number[]> = {
        baseline: prod,
        graph: fuse([text, semantic, graphList(db, query.q, f, plain)]),
        "graph+tags": fuse([text, semantic, graphList(db, query.q, f, tagged)]),
      };
      for (const v of VARIANTS) {
        ranks[v].push(firstRank(results[v], query.relevant));
        if (query.relevant.length > 1) recall5[v].push(results[v].slice(0, 5).filter((id) => query.relevant.includes(id)).length / query.relevant.length);
      }
      const [b, g, t] = VARIANTS.map((v) => firstRank(results[v], query.relevant) ?? "-");
      if (b !== g || b !== t) changes.push(`  ${String(b).padStart(2)} -> ${String(g).padStart(2)} / ${String(t).padStart(2)}  ${query.q}`);
    }

    const n = queries.length;
    console.log(`\n## scope: ${setting === "all" ? "all projects" : "query's project + global"} (${n} queries)\n`);
    console.log("| variant | hit@1 | hit@3 | MRR | recall@5 (multi) |\n|---|---|---|---|---|");
    for (const v of VARIANTS) {
      const r = ranks[v];
      const hit = (k: number) => r.filter((x) => x !== null && x <= k).length;
      const mrr = r.reduce((s: number, x) => s + (x ? 1 / x : 0), 0) / n;
      const r5 = recall5[v].length ? recall5[v].reduce((a, b) => a + b, 0) / recall5[v].length : NaN;
      console.log(`| ${v} | ${hit(1)}/${n} | ${hit(3)}/${n} | ${mrr.toFixed(3)} | ${r5.toFixed(2)} |`);
    }
    console.log(`\nRank of first relevant memory, baseline -> graph / graph+tags:\n${changes.join("\n") || "  (no changes)"}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
