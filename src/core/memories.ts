import type { Embedder } from "../embed/types.js";
import type { Db } from "./db.js";
import { rowToMemory, whereClause, type Filters, type MemoryRow } from "./rows.js";
import {
  DEFAULT_CATEGORY,
  MAX_CONTENT_LENGTH,
  MemiError,
  type Memory,
  type MemoryPatch,
  type NewMemory,
  type Scope,
} from "./types.js";
import { search, type SearchOptions } from "./search.js";
import { deleteVector, embedMissing, embedderState, ensureVectors, knn, mismatchMessage, putVector, rebuildVectors, scopeKey } from "./vectors.js";

/** Cosine distance under which a new memory is reported as similar to an existing one. */
export const SIMILAR_DISTANCE = 0.15;

export interface AddResult {
  memory: Memory;
  similar: { memory: Memory; distance: number }[];
  embedded: boolean;
  warning?: string;
}

export interface ListOptions extends Filters {
  limit?: number;
  offset?: number;
  order?: "recent" | "oldest" | "importance";
}

export interface CategoryInfo {
  name: string;
  description: string;
  builtin: boolean;
  count: number;
}

const ORDER: Record<NonNullable<ListOptions["order"]>, string> = {
  recent: "m.updated_at DESC, m.id DESC",
  oldest: "m.created_at ASC, m.id ASC",
  importance: "m.importance DESC, m.updated_at DESC",
};

export function normalizeCategory(raw: string): string {
  const name = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) {
    throw new MemiError(`Invalid category "${raw}". Use up to 32 letters, numbers, dashes or underscores.`);
  }
  return name;
}

const normalizeTags = (tags: string[] = []) => [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);

function checkImportance(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new MemiError("Importance must be a whole number from 1 to 5.");
  return n;
}

function checkContent(content: string) {
  const text = content.trim();
  if (!text) throw new MemiError("Memory content cannot be empty.");
  if (text.length > MAX_CONTENT_LENGTH) throw new MemiError(`Memory content is too long (max ${MAX_CONTENT_LENGTH} characters).`);
  return text;
}

export class MemoryStore {
  constructor(
    readonly db: Db,
    readonly embedder: Embedder | null = null,
  ) {}

  private ensureCategory(name: string) {
    this.db.prepare("INSERT OR IGNORE INTO categories(name, description, builtin) VALUES (?, '', 0)").run(name);
  }

  private resolveScope(scope: Scope | undefined, project: string | null | undefined): { scope: Scope; project: string | null } {
    const s = scope ?? (project ? "project" : "global");
    if (s === "project" && !project) throw new MemiError("A project memory needs a project name.");
    return { scope: s, project: s === "project" ? project! : null };
  }

  get(id: number): Memory | null {
    const row = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as MemoryRow | undefined;
    return row ? rowToMemory(row) : null;
  }

  private getMany(ids: number[]): Memory[] {
    if (!ids.length) return [];
    const rows = this.db.prepare(`SELECT * FROM memories WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as MemoryRow[];
    return rows.map(rowToMemory);
  }

  /** Embeds text if possible. Never throws: a memory is saved even when the embedder is down. */
  private async tryEmbed(text: string): Promise<{ vec: number[] | null; warning?: string }> {
    if (!this.embedder) return { vec: null, warning: "No embedder configured, saved for text search only." };
    try {
      const state = await ensureVectors(this.db, this.embedder);
      if (state.status === "mismatch") return { vec: null, warning: mismatchMessage(state, this.embedder) };
      const [vec] = await this.embedder.embed([text], "document");
      return { vec: vec ?? null };
    } catch (err) {
      return { vec: null, warning: `Saved without a vector (${(err as Error).message}). Run \`memi reindex --missing\` later to backfill.` };
    }
  }

  async add(input: NewMemory): Promise<AddResult> {
    const content = checkContent(input.content);
    const { scope, project } = this.resolveScope(input.scope, input.project);
    const category = normalizeCategory(input.category ?? DEFAULT_CATEGORY);
    const importance = checkImportance(input.importance ?? 3);
    const now = new Date().toISOString();
    const { vec, warning } = await this.tryEmbed(content);
    const key = scopeKey(scope, project);

    const similarHits = vec ? knn(this.db, vec, 5, key).filter((n) => n.distance <= SIMILAR_DISTANCE) : [];
    const id = this.db.transaction(() => {
      this.ensureCategory(category);
      const res = this.db
        .prepare(
          `INSERT INTO memories(scope, project, agent, category, content, tags, importance, pinned, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(scope, project, input.agent ?? null, category, content, JSON.stringify(normalizeTags(input.tags)), importance, input.pinned ? 1 : 0, now, now);
      const newId = Number(res.lastInsertRowid);
      if (vec) putVector(this.db, newId, key, vec);
      return newId;
    })();

    const byId = new Map(this.getMany(similarHits.map((h) => h.id)).map((m) => [m.id, m]));
    return {
      memory: this.get(id)!,
      similar: similarHits.flatMap((h) => (byId.has(h.id) ? [{ memory: byId.get(h.id)!, distance: h.distance }] : [])),
      embedded: vec !== null,
      warning,
    };
  }

  async update(id: number, patch: MemoryPatch): Promise<{ memory: Memory; warning?: string } | null> {
    const current = this.get(id);
    if (!current) return null;
    const content = patch.content !== undefined ? checkContent(patch.content) : current.content;
    const target = this.resolveScope(patch.scope ?? current.scope, patch.project !== undefined ? patch.project : current.project);
    const category = patch.category !== undefined ? normalizeCategory(patch.category) : current.category;
    const importance = patch.importance !== undefined ? checkImportance(patch.importance) : current.importance;
    const tags = patch.tags !== undefined ? normalizeTags(patch.tags) : current.tags;
    const pinned = patch.pinned ?? current.pinned;
    const needsVector = content !== current.content || target.scope !== current.scope || target.project !== current.project;

    const embedded = needsVector ? await this.tryEmbed(content) : { vec: null as number[] | null, warning: undefined };
    this.db.transaction(() => {
      this.ensureCategory(category);
      this.db
        .prepare("UPDATE memories SET scope=?, project=?, category=?, content=?, tags=?, importance=?, pinned=?, updated_at=? WHERE id=?")
        .run(target.scope, target.project, category, content, JSON.stringify(tags), importance, pinned ? 1 : 0, new Date().toISOString(), id);
      if (needsVector) {
        deleteVector(this.db, id);
        if (embedded.vec) putVector(this.db, id, scopeKey(target.scope, target.project), embedded.vec);
      }
    })();
    return { memory: this.get(id)!, warning: embedded.warning };
  }

  remove(id: number): boolean {
    return this.db.transaction(() => {
      deleteVector(this.db, id);
      return this.db.prepare("DELETE FROM memories WHERE id = ?").run(id).changes > 0;
    })();
  }

  list(opts: ListOptions = {}): { items: Memory[]; total: number } {
    const { sql, params } = whereClause(opts);
    const total = (this.db.prepare(`SELECT COUNT(*) AS n FROM memories m WHERE ${sql}`).get(params) as { n: number }).n;
    const rows = this.db
      .prepare(`SELECT m.* FROM memories m WHERE ${sql} ORDER BY ${ORDER[opts.order ?? "recent"]} LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: Math.min(opts.limit ?? 50, 200), offset: opts.offset ?? 0 }) as MemoryRow[];
    return { items: rows.map(rowToMemory), total };
  }

  search(opts: SearchOptions) {
    return search(this.db, this.embedder, opts);
  }

  /** Pinned and high-importance memories: what an agent should load at the start of a session. */
  context(opts: { project?: string | null; limit?: number } = {}): Memory[] {
    const { sql, params } = whereClause({ scope: "both", project: opts.project });
    const rows = this.db
      .prepare(
        `SELECT m.* FROM memories m WHERE ${sql} AND (m.pinned = 1 OR m.importance >= 4)
         ORDER BY m.pinned DESC, m.importance DESC, m.updated_at DESC LIMIT @limit`,
      )
      .all({ ...params, limit: opts.limit ?? 20 }) as MemoryRow[];
    return rows.map(rowToMemory);
  }

  categories(): CategoryInfo[] {
    const rows = this.db
      .prepare(
        `SELECT c.name, c.description, c.builtin, COUNT(m.id) AS count
         FROM categories c LEFT JOIN memories m ON m.category = c.name
         GROUP BY c.name ORDER BY c.builtin DESC, c.name`,
      )
      .all() as { name: string; description: string; builtin: number; count: number }[];
    return rows.map((r) => ({ ...r, builtin: r.builtin === 1 }));
  }

  projects(): { project: string; count: number }[] {
    return this.db
      .prepare("SELECT project, COUNT(*) AS count FROM memories WHERE scope = 'project' GROUP BY project ORDER BY project")
      .all() as { project: string; count: number }[];
  }

  private everything(): Memory[] {
    return (this.db.prepare("SELECT * FROM memories ORDER BY id").all() as MemoryRow[]).map(rowToMemory);
  }

  /** Drops and rebuilds the vector table with the current embedder. Memories are kept. */
  async reindex(onProgress?: (done: number, total: number) => void) {
    if (!this.embedder) throw new MemiError("No embedder configured.");
    return rebuildVectors(this.db, this.embedder, this.everything(), onProgress);
  }

  async backfill(): Promise<number> {
    if (!this.embedder) throw new MemiError("No embedder configured.");
    return embedMissing(this.db, this.embedder, this.everything());
  }

  status() {
    const total = (this.db.prepare("SELECT COUNT(*) AS n FROM memories").get() as { n: number }).n;
    const state = this.embedder ? embedderState(this.db, this.embedder) : { status: "uninitialized" as const };
    const vectors = state.status === "uninitialized" ? 0 : (this.db.prepare("SELECT COUNT(*) AS n FROM memory_vec").get() as { n: number }).n;
    return {
      total,
      vectors,
      embedder: this.embedder ? { provider: this.embedder.provider, model: this.embedder.model } : null,
      state,
      warning: this.embedder && state.status === "mismatch" ? mismatchMessage(state, this.embedder) : undefined,
    };
  }
}
