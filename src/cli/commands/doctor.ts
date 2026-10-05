import { existsSync } from "node:fs";
import { configPath, dbPath, loadConfig, memiHome, resolveAgent, resolveEmbedder } from "../../core/config.js";
import { resolveProject } from "../../core/project.js";
import { openRuntime } from "../../core/runtime.js";
import { action, type Register } from "../util.js";

export const registerDoctor: Register = (program) => {
  program
    .command("doctor")
    .description("Check the database, the embedder, and project detection")
    .action(
      action(async () => {
        let failed = false;
        const line = (level: "ok" | "warn" | "fail", msg: string) => {
          if (level === "fail") failed = true;
          console.log(`${level.padEnd(4)}  ${msg}`);
        };

        const config = loadConfig();
        const resolved = resolveEmbedder(config);
        console.log(`Home: ${memiHome()}  (config ${existsSync(configPath()) ? "found" : "not created yet, using defaults"})\n`);

        const { store } = openRuntime();
        const status = store.status();
        line("ok", `Database at ${dbPath()}: ${status.total} memories`);

        if (resolved.provider === "openai" && !resolved.apiKey) line("fail", "OPENAI_API_KEY is not set");
        else {
          const start = Date.now();
          try {
            const [vec] = await store.embedder!.embed(["memi doctor check"], "query");
            line("ok", `Embedder ${resolved.provider}/${resolved.model} replied in ${Date.now() - start}ms (${vec?.length} dimensions)`);
          } catch (err) {
            line("fail", (err as Error).message);
          }
        }

        const { state } = status;
        if (state.status === "uninitialized") line("ok", "No vectors yet. The index is created when you save your first memory.");
        else if (state.status === "mismatch") line("fail", status.warning ?? "The embedder changed. Run `memi reindex`.");
        else {
          line("ok", `Vector index matches (${state.stored.provider}/${state.stored.model}, ${state.stored.dimensions} dimensions)`);
          const missing = status.total - status.vectors;
          if (missing > 0) line("warn", `${missing} memories have no vector. Run \`memi reindex --missing\`.`);
        }

        const agent = resolveAgent(config);
        const project = resolveProject({ agent });
        line(project ? "ok" : "warn", project ? `Project here: ${project.project} (from ${project.source})` : "No project detected here. Set MEMI_AGENT or run inside a git repo.");
        console.log(`      Agent name: ${agent ?? "(none)"}`);
        if (failed) process.exit(1);
      }),
    );
};
