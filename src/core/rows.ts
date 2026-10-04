import type { Memory, Scope } from "./types.js";

export interface MemoryRow {
  id: number;
  scope: Scope;
  project: string | null;
  agent: string | null;
  category: string;
  content: string;
  tags: string;
  importance: number;
  pinned: number;
  created_at: string;
  updated_at: string;
}

export const rowToMemory = (r: MemoryRow): Memory => ({
  id: r.id,
  scope: r.scope,
  project: r.project,
  agent: r.agent,
  category: r.category,
  content: r.content,
  tags: JSON.parse(r.tags) as string[],
  importance: r.importance,
  pinned: r.pinned === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** both = global plus the given project, all = every project, global / project = just that one. */
export type ScopeFilter = "both" | "global" | "project" | "all";

export interface Filters {
  scope?: ScopeFilter;
  project?: string | null;
  category?: string;
  minImportance?: number;
  pinned?: boolean;
  agent?: string;
}

/** Builds a WHERE fragment for the memories table, aliased as `alias`. */
export function whereClause(f: Filters, alias = "m"): { sql: string; params: Record<string, unknown> } {
  const a = alias;
  const parts: string[] = [];
  const params: Record<string, unknown> = {};
  const scope = f.scope ?? "both";
  const project = f.project ?? null;
  if (scope === "global") parts.push(`${a}.scope = 'global'`);
  else if (scope === "project") parts.push(project ? `${a}.scope = 'project' AND ${a}.project = @project` : "0");
  else if (scope === "both") parts.push(project ? `(${a}.scope = 'global' OR (${a}.scope = 'project' AND ${a}.project = @project))` : `${a}.scope = 'global'`);
  if (project && scope !== "global" && scope !== "all") params.project = project;
  if (f.category) (parts.push(`${a}.category = @category`), (params.category = f.category));
  if (f.minImportance) (parts.push(`${a}.importance >= @minImportance`), (params.minImportance = f.minImportance));
  if (f.pinned !== undefined) parts.push(`${a}.pinned = ${f.pinned ? 1 : 0}`);
  if (f.agent) (parts.push(`${a}.agent = @agent`), (params.agent = f.agent));
  return { sql: parts.length ? parts.join(" AND ") : "1", params };
}
