import { formatHits, formatMemories, formatMemory } from "../../core/format.js";
import { pickScope, resolveProject } from "../../core/project.js";
import { openRuntime } from "../../core/runtime.js";
import { MemiError } from "../../core/types.js";
import { action, confirm, printJson, splitTags, toInt, type Register } from "../util.js";

const SCOPES = ["both", "project", "global", "all"] as const;
const checkScope = (v: string) => {
  if (!(SCOPES as readonly string[]).includes(v)) throw new MemiError(`Scope must be one of: ${SCOPES.join(", ")}`);
  return v as (typeof SCOPES)[number];
};
const currentProject = (rt: ReturnType<typeof openRuntime>, project?: string) =>
  resolveProject({ project, agent: rt.agent })?.project ?? null;

export const registerMemories: Register = (program) => {
  program
    .command("add <content...>")
    .description("Save a memory")
    .option("-c, --category <name>", "category (default: context)")
    .option("-i, --importance <1-5>", "importance", toInt("Importance"))
    .option("-t, --tags <a,b>", "comma-separated tags")
    .option("--pin", "load this at the start of every session")
    .option("--global", "save globally instead of for this project")
    .option("-p, --project <name>", "project name (default: git repo or agent name)")
    .option("--agent <name>", "agent name to record")
    .action(
      action(async (content: string[], o) => {
        const rt = openRuntime();
        const agent = o.agent ?? rt.agent;
        const target = pickScope({ scope: o.global ? "global" : undefined, project: o.project, agent });
        const r = await rt.store.add({
          content: content.join(" "),
          ...target,
          agent,
          category: o.category,
          importance: o.importance,
          tags: splitTags(o.tags),
          pinned: o.pin,
        });
        console.log(`Saved #${r.memory.id} (${target.scope === "global" ? "global" : `project ${target.project}`}, ${r.memory.category}, importance ${r.memory.importance}).`);
        if (r.similar.length) console.log(`\nSimilar memories already exist:\n\n${formatMemories(r.similar.map((s) => s.memory))}`);
        if (r.warning) console.error(`\nNote: ${r.warning}`);
      }),
    );

  program
    .command("search <query...>")
    .description("Search memories by meaning and keyword")
    .option("--mode <mode>", "hybrid, semantic or text", "hybrid")
    .option("--scope <scope>", "both, project, global or all", checkScope, "both")
    .option("-p, --project <name>", "project name")
    .option("-c, --category <name>")
    .option("--min-importance <1-5>", "", toInt("Importance"))
    .option("-n, --limit <n>", "", toInt("Limit"), 10)
    .option("--json", "print JSON")
    .action(
      action(async (query: string[], o) => {
        const rt = openRuntime();
        const r = await rt.store.search({
          query: query.join(" "),
          mode: o.mode,
          scope: o.scope,
          project: currentProject(rt, o.project),
          category: o.category,
          minImportance: o.minImportance,
          limit: o.limit,
        });
        if (o.json) return printJson(r);
        console.log(r.hits.length ? formatHits(r.hits) : "No matching memories.");
        if (r.note) console.error(`\nNote: ${r.note}`);
      }),
    );

  program
    .command("list")
    .description("List memories")
    .option("--scope <scope>", "both, project, global or all", checkScope, "both")
    .option("-p, --project <name>", "project name")
    .option("-c, --category <name>")
    .option("--min-importance <1-5>", "", toInt("Importance"))
    .option("--pinned", "only pinned memories")
    .option("--order <order>", "recent, oldest or importance", "recent")
    .option("-n, --limit <n>", "", toInt("Limit"), 50)
    .option("--offset <n>", "", toInt("Offset"), 0)
    .option("--json", "print JSON")
    .action(
      action(async (o) => {
        const rt = openRuntime();
        const r = rt.store.list({
          scope: o.scope,
          project: currentProject(rt, o.project),
          category: o.category,
          minImportance: o.minImportance,
          pinned: o.pinned ? true : undefined,
          order: o.order,
          limit: o.limit,
          offset: o.offset,
        });
        if (o.json) return printJson(r);
        console.log(r.items.length ? `${r.items.length} of ${r.total}\n\n${formatMemories(r.items)}` : "No memories found.");
      }),
    );

  program
    .command("update <id>")
    .description("Change a memory")
    .option("--content <text>")
    .option("-c, --category <name>")
    .option("-i, --importance <1-5>", "", toInt("Importance"))
    .option("-t, --tags <a,b>", "replaces existing tags")
    .option("--pin")
    .option("--unpin")
    .option("--global", "move to global")
    .option("-p, --project <name>", "move to this project")
    .action(
      action(async (id: string, o) => {
        const rt = openRuntime();
        const scope = o.global ? "global" : o.project ? "project" : undefined;
        const r = await rt.store.update(toInt("Id")(id), {
          content: o.content,
          category: o.category,
          importance: o.importance,
          tags: splitTags(o.tags),
          pinned: o.pin ? true : o.unpin ? false : undefined,
          scope,
          project: o.project,
        });
        if (!r) throw new MemiError(`No memory with id ${id}.`);
        console.log(`Updated.\n\n${formatMemory(r.memory)}`);
        if (r.warning) console.error(`\nNote: ${r.warning}`);
      }),
    );

  program
    .command("forget <id>")
    .description("Delete a memory")
    .option("-y, --yes", "skip the confirmation")
    .action(
      action(async (id: string, o) => {
        const rt = openRuntime();
        const memory = rt.store.get(toInt("Id")(id));
        if (!memory) throw new MemiError(`No memory with id ${id}.`);
        console.error(formatMemory(memory) + "\n");
        if (!(await confirm("Delete this memory permanently?", o.yes))) return console.error("Kept.");
        rt.store.remove(memory.id);
        console.log(`Deleted #${memory.id}.`);
      }),
    );

  program
    .command("categories")
    .description("List categories and how many memories each holds")
    .action(action(() => console.log(openRuntime().store.categories().map((c) => `${c.name} (${c.count})${c.description ? `: ${c.description}` : ""}`).join("\n"))));
};
