import { describe, expect, it } from "vitest";
import { openDb } from "../src/core/db.js";
import { recordRecall, stats } from "../src/core/stats.js";
import { newStore } from "./helpers.js";

// A fixed "now" in local time, so day buckets line up with local midnight on any machine.
const NOW = new Date(2026, 9, 5, 15, 30);
const daysAgo = (n: number, hour = 12) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n, hour);

async function seeded() {
  const store = newStore();
  const add = async (content: string, created: Date, over = {}) => {
    const { memory } = await store.add({ content, ...over });
    store.db.prepare("UPDATE memories SET created_at = ?, updated_at = ? WHERE id = ?").run(created.toISOString(), created.toISOString(), memory.id);
  };
  await add("today alpha", daysAgo(0, 9), { scope: "project", project: "alpha", category: "fact" });
  await add("today global", daysAgo(0, 10), { category: "decision" });
  await add("two days alpha", daysAgo(2), { scope: "project", project: "alpha", category: "fact" });
  await add("five days beta", daysAgo(5), { scope: "project", project: "beta", category: "todo" });
  await add("forty days old", daysAgo(40), { category: "fact" });
  recordRecall(store.db, { agent: "claude", project: "alpha", hits: 3 }, daysAgo(0, 11));
  recordRecall(store.db, { agent: "codex", project: null, hits: 0 }, daysAgo(1));
  recordRecall(store.db, { agent: "claude", project: "alpha", hits: 4 }, daysAgo(20));
  return store;
}

describe("stats", () => {
  it("counts memories and recalls inside a 7 day range", async () => {
    const s = stats((await seeded()).db, "7d", NOW);
    expect(s.since).toBe(daysAgo(6, 0).toISOString());
    expect(s.stored).toEqual({ total: 5, added: 4, today: 2 });
    expect(s.recalled).toEqual({ memories: 3, searches: 2 });
    expect(s.global).toBe(1);
    expect(s.projects).toEqual([
      { project: "alpha", count: 2 },
      { project: "beta", count: 1 },
    ]);
    expect(s.categories).toEqual([
      { name: "fact", count: 2 },
      { name: "decision", count: 1 },
      { name: "todo", count: 1 },
    ]);
  });

  it("puts activity into one bar per local day, oldest first", async () => {
    const { activity } = stats((await seeded()).db, "7d", NOW);
    expect(activity.bucket).toBe("day");
    expect(activity.buckets).toHaveLength(7);
    expect(activity.buckets[0]!.start).toBe(daysAgo(6, 0).toISOString());
    expect(activity.buckets.map((b) => b.saved)).toEqual([0, 1, 0, 0, 1, 0, 2]);
    expect(activity.buckets.map((b) => b.recalled)).toEqual([0, 0, 0, 0, 0, 0, 3]);
  });

  it("uses hourly bars for 24 hours and leaves older rows out", async () => {
    const s = stats((await seeded()).db, "24h", NOW);
    expect(s.activity.bucket).toBe("hour");
    expect(s.activity.buckets).toHaveLength(24);
    expect(s.stored.added).toBe(2);
    expect(s.activity.buckets.reduce((n, b) => n + b.saved, 0)).toBe(2);
    expect(s.recalled.searches).toBe(1);
  });

  it("starts all time at the oldest memory or recall", async () => {
    const s = stats((await seeded()).db, "all", NOW);
    expect(s.since).toBeNull();
    expect(s.stored.added).toBe(5);
    expect(s.recalled).toEqual({ memories: 7, searches: 3 });
    expect(s.activity.bucket).toBe("day");
    expect(s.activity.buckets).toHaveLength(41);
    expect(s.activity.buckets[0]!.saved).toBe(1);
  });

  it("switches all time to weekly bars when the history is long", async () => {
    const store = await seeded();
    recordRecall(store.db, { agent: null, project: null, hits: 1 }, daysAgo(200));
    const { activity } = stats(store.db, "all", NOW);
    expect(activity.bucket).toBe("week");
    expect(activity.buckets.reduce((n, b) => n + b.recalled, 0)).toBe(8);
    expect(activity.buckets.reduce((n, b) => n + b.saved, 0)).toBe(5);
  });

  it("works on an empty database", () => {
    const s = stats(openDb(":memory:"), "all", NOW);
    expect(s.stored).toEqual({ total: 0, added: 0, today: 0 });
    expect(s.recalled).toEqual({ memories: 0, searches: 0 });
    expect(s.activity.buckets).toHaveLength(1);
  });

  it("lists agents that saved memories, busiest first", async () => {
    const store = newStore();
    await store.add({ content: "a", agent: "codex" });
    await store.add({ content: "b", agent: "claude" });
    await store.add({ content: "c", agent: "claude" });
    await store.add({ content: "d" });
    expect(store.agents()).toEqual([
      { agent: "claude", count: 2 },
      { agent: "codex", count: 1 },
    ]);
  });
});
