import type { SearchHit } from "./search.js";
import type { Memory } from "./types.js";

export function formatMemory(m: Memory, score?: number): string {
  const where = m.scope === "global" ? "global" : `project ${m.project}`;
  const meta = [
    m.category,
    `importance ${m.importance}`,
    m.pinned ? "pinned" : null,
    where,
    m.tags.length ? `tags ${m.tags.join(", ")}` : null,
    m.updatedAt.slice(0, 10),
    m.agent ? `by ${m.agent}` : null,
    score !== undefined ? `score ${score.toFixed(4)}` : null,
  ].filter(Boolean);
  return `#${m.id} | ${meta.join(" | ")}\n${m.content}`;
}

export const formatMemories = (list: Memory[]) => list.map((m) => formatMemory(m)).join("\n\n");

export const formatHits = (hits: SearchHit[]) => hits.map((h) => formatMemory(h.memory, h.score)).join("\n\n");
