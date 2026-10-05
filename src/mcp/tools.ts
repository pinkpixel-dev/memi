import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatHits, formatMemories, formatMemory } from "../core/format.js";
import type { MemoryStore } from "../core/memories.js";
import { pickScope, resolveProject } from "../core/project.js";
import { MemiError } from "../core/types.js";
import { EmbedError } from "../embed/types.js";

export interface ToolContext {
  store: MemoryStore;
  /** Agent name from MEMI_AGENT or config. */
  agent: string | null;
  /** Falls back to the connected client's name when no agent is configured. */
  clientName: () => string | null;
  cwd: string;
}

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (t: string): Result => ({ content: [{ type: "text", text: t }] });

/** Turns expected failures into tool errors the model can read, and lets real bugs through. */
function safe<A>(fn: (args: A) => Promise<Result> | Result) {
  return async (args: A): Promise<Result> => {
    try {
      return await fn(args);
    } catch (err) {
      if (err instanceof MemiError || err instanceof EmbedError) {
        return { ...text((err as Error).message), isError: true };
      }
      throw err;
    }
  };
}

const category = z.string().describe("Short label such as decision, preference, fact, error, todo, context. New names are created on the fly.");
const importance = z.number().int().min(1).max(5).describe("1 (minor) to 5 (critical). Default 3.");
const project = z.string().describe("Project name. Normally left out: it is worked out from the git repo or agent name.");
const readScope = z.enum(["both", "project", "global", "all"]).describe("both = global plus this project (default), project, global, or all projects.");

export function registerTools(server: McpServer, ctx: ToolContext) {
  const { store } = ctx;
  const agent = () => ctx.agent ?? ctx.clientName();
  const current = (p?: string) => resolveProject({ project: p, agent: ctx.agent, cwd: ctx.cwd })?.project ?? null;

  server.registerTool(
    "remember",
    {
      title: "Save a memory",
      description:
        "Save something worth remembering in future sessions: a decision and why, a user preference, a durable fact, a mistake to avoid, or follow-up work. " +
        "Write it so it makes sense on its own, without this conversation. Do not save secrets or things that are obvious from the code. " +
        "The result lists similar existing memories; if one already covers this, use update_memory instead of saving a duplicate.",
      inputSchema: {
        content: z.string().describe("The memory itself. Short and self-contained."),
        category: category.optional(),
        importance: importance.optional(),
        tags: z.array(z.string()).optional().describe("Optional keywords to help find it later."),
        pinned: z.boolean().optional().describe("Pinned memories are loaded at the start of every session. Use for the few things that must never be missed."),
        scope: z.enum(["project", "global"]).optional().describe("project = only this project. global = applies everywhere, such as user preferences. Default: project when one is known."),
        project: project.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    safe(async (a) => {
      const target = pickScope({ scope: a.scope, project: a.project, agent: ctx.agent, cwd: ctx.cwd });
      const r = await store.add({ ...a, ...target, agent: agent() });
      const lines = [`Saved memory #${r.memory.id} (${r.memory.scope === "global" ? "global" : `project ${r.memory.project}`}, ${r.memory.category}, importance ${r.memory.importance}).`];
      if (r.similar.length) {
        lines.push("", "Similar memories already exist. If one covers this, call update_memory on it and forget #" + r.memory.id + ":");
        lines.push(...r.similar.map((s) => `${formatMemory(s.memory)}`));
      }
      if (r.warning) lines.push("", `Note: ${r.warning}`);
      return text(lines.join("\n"));
    }),
  );

  server.registerTool(
    "recall",
    {
      title: "Search memories",
      description:
        "Search saved memories by meaning and by keyword. Use before answering anything that earlier decisions, preferences, or mistakes might affect, " +
        "and when the user refers to something from a past session. Describe what you are looking for in plain language.",
      inputSchema: {
        query: z.string().describe("What to look for."),
        scope: readScope.optional(),
        project: project.optional(),
        category: category.optional(),
        min_importance: importance.optional(),
        mode: z.enum(["hybrid", "semantic", "text"]).optional().describe("hybrid (default) combines meaning and keywords."),
        limit: z.number().int().min(1).max(50).optional().describe("Default 10."),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a) => {
      const r = await store.search({
        query: a.query,
        scope: a.scope,
        project: current(a.project),
        category: a.category,
        minImportance: a.min_importance,
        mode: a.mode,
        limit: a.limit,
      });
      const out = r.hits.length ? formatHits(r.hits) : "No matching memories.";
      return text(r.note ? `${out}\n\nNote: ${r.note}` : out);
    }),
  );

  server.registerTool(
    "get_context",
    {
      title: "Load session context",
      description:
        "Load the pinned and high-importance memories (importance 4 or 5) for this project plus global ones. Call this once at the start of a session.",
      inputSchema: { project: project.optional(), limit: z.number().int().min(1).max(50).optional().describe("Default 20.") },
      annotations: { readOnlyHint: true },
    },
    safe(async (a) => {
      const list = store.context({ project: current(a.project), limit: a.limit });
      return text(list.length ? formatMemories(list) : "No pinned or high-importance memories yet.");
    }),
  );

  server.registerTool(
    "list_memories",
    {
      title: "List memories",
      description: "Browse memories without a search query, newest first by default. Use recall when you know what you are looking for.",
      inputSchema: {
        scope: readScope.optional(),
        project: project.optional(),
        category: category.optional(),
        min_importance: importance.optional(),
        pinned: z.boolean().optional(),
        order: z.enum(["recent", "oldest", "importance"]).optional(),
        limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    safe(async (a) => {
      const { items, total } = store.list({
        scope: a.scope,
        project: current(a.project),
        category: a.category,
        minImportance: a.min_importance,
        pinned: a.pinned,
        order: a.order,
        limit: a.limit,
        offset: a.offset,
      });
      return text(items.length ? `${items.length} of ${total}\n\n${formatMemories(items)}` : "No memories found.");
    }),
  );

  server.registerTool(
    "update_memory",
    {
      title: "Update a memory",
      description: "Change a memory by id: reword it, recategorize it, change importance, tags or pinning, or move it between global and a project. Only the fields you pass change.",
      inputSchema: {
        id: z.number().int().describe("Memory id, shown as #id in results."),
        content: z.string().optional(),
        category: category.optional(),
        importance: importance.optional(),
        tags: z.array(z.string()).optional().describe("Replaces the existing tags."),
        pinned: z.boolean().optional(),
        scope: z.enum(["project", "global"]).optional(),
        project: project.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    safe(async ({ id, ...patch }) => {
      const moving = patch.scope === "project" && !patch.project;
      const r = await store.update(id, moving ? { ...patch, project: pickScope({ scope: "project", agent: ctx.agent, cwd: ctx.cwd }).project } : patch);
      if (!r) return { ...text(`No memory with id ${id}.`), isError: true };
      return text(`Updated.\n\n${formatMemory(r.memory)}${r.warning ? `\n\nNote: ${r.warning}` : ""}`);
    }),
  );

  server.registerTool(
    "forget",
    {
      title: "Delete a memory",
      description: "Permanently delete a memory by id. Use when a memory is wrong, outdated, or a duplicate. This cannot be undone.",
      inputSchema: { id: z.number().int().describe("Memory id, shown as #id in results.") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    safe(async ({ id }) => (store.remove(id) ? text(`Deleted memory #${id}.`) : { ...text(`No memory with id ${id}.`), isError: true })),
  );

  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description: "Show every category with how many memories it holds. Check this before inventing a new category name.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    safe(async () => text(store.categories().map((c) => `${c.name} (${c.count})${c.description ? `: ${c.description}` : ""}`).join("\n"))),
  );
}
