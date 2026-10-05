import { openRuntime } from "../../core/runtime.js";
import { MemiError } from "../../core/types.js";
import { action, confirm, type Register } from "../util.js";

export const registerReindex: Register = (program) => {
  program
    .command("reindex")
    .description("Rebuild the vector index with the current embedder")
    .option("--missing", "only embed memories that have no vector yet, nothing is dropped")
    .option("-y, --yes", "skip the confirmation")
    .action(
      action(async (o) => {
        const { store } = openRuntime();
        const status = store.status();
        if (!status.embedder) throw new MemiError("No embedder configured.");
        const name = `${status.embedder.provider}/${status.embedder.model}`;

        if (o.missing) {
          if (status.state.status === "mismatch") throw new MemiError(status.warning ?? "The embedder changed. Run a full reindex.");
          console.log(`Embedded ${await store.backfill()} memories with ${name}.`);
          return;
        }

        if (status.state.status === "mismatch") {
          const { provider, model, dimensions } = status.state.stored;
          console.error(`The embedder changed from ${provider}/${model} (${dimensions} dims) to ${name}.\n`);
        }
        console.error(
          `This drops the vector table and rebuilds it for ${name}, re-embedding all ${status.total} memories.\n` +
            "The memories themselves are kept. If the embedder is unreachable, nothing is changed.\n",
        );
        if (!(await confirm("Rebuild the vector index?", o.yes))) return console.error("Nothing changed.");

        const result = await store.reindex((done, total) => process.stderr.write(`\rEmbedding ${done}/${total}`));
        process.stderr.write("\n");
        console.log(`Rebuilt ${result.count} vectors with ${name} (${result.dimensions} dimensions).`);
      }),
    );
};
