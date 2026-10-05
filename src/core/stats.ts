import type { Db } from "./db.js";

export const RANGES = ["24h", "7d", "30d", "90d", "all"] as const;
export type Range = (typeof RANGES)[number];

export type Bucket = "hour" | "day" | "week";

export interface Stats {
  range: Range;
  /** Start of the range, or null for all time. */
  since: string | null;
  stored: { total: number; added: number; today: number };
  recalled: { memories: number; searches: number };
  global: number;
  projects: { project: string; count: number }[];
  categories: { name: string; count: number }[];
  activity: { bucket: Bucket; buckets: { start: string; saved: number; recalled: number }[] };
}

const DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
/** All time switches from daily to weekly bars past this many days. */
const MAX_DAILY = 90;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function step(d: Date, bucket: Bucket): Date {
  const next = new Date(d);
  if (bucket === "hour") next.setHours(next.getHours() + 1);
  else next.setDate(next.getDate() + (bucket === "week" ? 7 : 1));
  return next;
}

/**
 * Bucket edges in local time, built by calendar steps rather than fixed milliseconds so a
 * daylight saving change doesn't push day boundaries off midnight.
 */
function edges(first: Date, bucket: Bucket, now: Date): Date[] {
  const out = [first];
  while (out.at(-1)! <= now) out.push(step(out.at(-1)!, bucket));
  return out;
}

function plan(db: Db, range: Range, now: Date): { since: Date | null; first: Date; bucket: Bucket } {
  if (range === "24h") {
    const first = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - 23);
    return { since: first, first, bucket: "hour" };
  }
  if (range !== "all") {
    const today = startOfDay(now);
    const first = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS[range]! - 1));
    return { since: first, first, bucket: "day" };
  }
  const { earliest } = db
    .prepare("SELECT MIN(t) AS earliest FROM (SELECT MIN(created_at) AS t FROM memories UNION ALL SELECT MIN(at) FROM recalls)")
    .get() as { earliest: string | null };
  const first = startOfDay(earliest ? new Date(earliest) : now);
  const days = Math.round((startOfDay(now).getTime() - first.getTime()) / 86_400_000) + 1;
  return { since: null, first, bucket: days > MAX_DAILY ? "week" : "day" };
}

/** Counts rows into buckets. Both lists are sorted by time, so one pass is enough. */
function fill(times: { t: string; n: number }[], starts: Date[], into: number[]) {
  let i = 0;
  for (const { t, n } of times) {
    const at = new Date(t);
    while (i < starts.length - 1 && at >= starts[i + 1]!) i++;
    if (at >= starts[0]!) into[i]! += n;
  }
}

export function stats(db: Db, range: Range, now: Date = new Date()): Stats {
  const { since, first, bucket } = plan(db, range, now);
  const from = (since ?? new Date(0)).toISOString();
  const count = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as { n: number }).n;

  const recalled = db.prepare("SELECT COUNT(*) AS searches, COALESCE(SUM(hits), 0) AS memories FROM recalls WHERE at >= ?").get(from) as {
    searches: number;
    memories: number;
  };

  const starts = edges(first, bucket, now);
  const bucketStarts = starts.slice(0, -1);
  const saved = bucketStarts.map(() => 0);
  const used = bucketStarts.map(() => 0);
  const firstIso = first.toISOString();
  fill(db.prepare("SELECT created_at AS t, 1 AS n FROM memories WHERE created_at >= ? ORDER BY created_at").all(firstIso) as { t: string; n: number }[], starts, saved);
  fill(db.prepare("SELECT at AS t, hits AS n FROM recalls WHERE at >= ? ORDER BY at").all(firstIso) as { t: string; n: number }[], starts, used);

  return {
    range,
    since: since?.toISOString() ?? null,
    stored: {
      total: count("SELECT COUNT(*) AS n FROM memories"),
      added: count("SELECT COUNT(*) AS n FROM memories WHERE created_at >= ?", from),
      today: count("SELECT COUNT(*) AS n FROM memories WHERE created_at >= ?", startOfDay(now).toISOString()),
    },
    recalled,
    global: count("SELECT COUNT(*) AS n FROM memories WHERE scope = 'global' AND created_at >= ?", from),
    projects: db
      .prepare("SELECT project, COUNT(*) AS count FROM memories WHERE scope = 'project' AND created_at >= ? GROUP BY project ORDER BY count DESC, project")
      .all(from) as Stats["projects"],
    categories: db
      .prepare("SELECT category AS name, COUNT(*) AS count FROM memories WHERE created_at >= ? GROUP BY category ORDER BY count DESC, name")
      .all(from) as Stats["categories"],
    activity: { bucket, buckets: bucketStarts.map((d, i) => ({ start: d.toISOString(), saved: saved[i]!, recalled: used[i]! })) },
  };
}

/** Logs one recall call. `hits` is how many memories it handed back. */
export function recordRecall(db: Db, entry: { agent: string | null; project: string | null; hits: number }, now: Date = new Date()) {
  db.prepare("INSERT INTO recalls(at, agent, project, hits) VALUES (?, ?, ?, ?)").run(now.toISOString(), entry.agent, entry.project, entry.hits);
}
