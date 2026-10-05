import { Hono } from "hono";
import { z } from "zod";
import type { MemoryStore } from "../core/memories.js";
import { MemiError } from "../core/types.js";
import { EmbedError } from "../embed/types.js";

export interface ApiContext {
  store: MemoryStore;
  /** The project of the folder `memi ui` was started in, if there is one. */
  currentProject: string | null;
}

const Scope = z.enum(["both", "project", "global", "all"]);
const Tags = z.array(z.string()).max(10);

const ListQuery = z.object({
  q: z.string().trim().optional(),
  scope: Scope.default("all"),
  project: z.string().optional(),
  category: z.string().optional(),
  minImportance: z.coerce.number().int().min(1).max(5).optional(),
  pinned: z.enum(["true", "false"]).optional(),
  order: z.enum(["recent", "oldest", "importance"]).default("recent"),
  mode: z.enum(["hybrid", "semantic", "text"]).default("hybrid"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const NewBody = z.object({
  content: z.string(),
  scope: z.enum(["project", "global"]).optional(),
  project: z.string().nullable().optional(),
  category: z.string().optional(),
  importance: z.number().int().optional(),
  tags: Tags.optional(),
  pinned: z.boolean().optional(),
});

const PatchBody = z.object({
  content: z.string().optional(),
  scope: z.enum(["project", "global"]).optional(),
  project: z.string().nullable().optional(),
  category: z.string().optional(),
  importance: z.number().int().optional(),
  tags: Tags.optional(),
  pinned: z.boolean().optional(),
});

const Id = z.coerce.number().int().positive();

export function createApi({ store, currentProject }: ApiContext): Hono {
  const api = new Hono();

  api.onError((err, c) => {
    if (err instanceof z.ZodError) return c.json({ error: err.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`).join("; ") }, 400);
    if (err instanceof SyntaxError) return c.json({ error: "Body is not valid JSON." }, 400);
    if (err instanceof MemiError || err instanceof EmbedError) return c.json({ error: err.message }, 400);
    console.error(err);
    return c.json({ error: "Something went wrong. Check the terminal running memi ui." }, 500);
  });

  api.get("/status", (c) =>
    c.json({
      ...store.status(),
      currentProject,
      projects: store.projects(),
      categories: store.categories(),
    }),
  );

  api.get("/memories", async (c) => {
    const q = ListQuery.parse(c.req.query());
    const filters = {
      scope: q.scope,
      project: q.project ?? null,
      category: q.category,
      minImportance: q.minImportance,
      pinned: q.pinned === undefined ? undefined : q.pinned === "true",
    };
    if (q.q) {
      const r = await store.search({ ...filters, query: q.q, mode: q.mode, limit: Math.min(q.limit, 50) });
      return c.json({
        items: r.hits.map((h) => h.memory),
        total: r.hits.length,
        scores: Object.fromEntries(r.hits.map((h) => [h.memory.id, h.score])),
        modeUsed: r.modeUsed,
        note: r.note ?? null,
      });
    }
    return c.json({ ...store.list({ ...filters, order: q.order, limit: q.limit, offset: q.offset }), scores: null, modeUsed: null, note: null });
  });

  api.post("/memories", async (c) => {
    const body = NewBody.parse(await c.req.json());
    return c.json(await store.add({ ...body, agent: "memi-ui" }), 201);
  });

  api.patch("/memories/:id", async (c) => {
    const id = Id.parse(c.req.param("id"));
    const result = await store.update(id, PatchBody.parse(await c.req.json()));
    return result ? c.json(result) : c.json({ error: `No memory with id ${id}.` }, 404);
  });

  api.delete("/memories/:id", (c) => {
    const id = Id.parse(c.req.param("id"));
    return store.remove(id) ? c.body(null, 204) : c.json({ error: `No memory with id ${id}.` }, 404);
  });

  return api;
}
