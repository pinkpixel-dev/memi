import { CONFIG_KEYS, configPath, loadConfig, resolveAgent, resolveEmbedder, saveConfig, setConfigValue } from "../../core/config.js";
import { openRuntime } from "../../core/runtime.js";
import { MemiError } from "../../core/types.js";
import { action, type Register } from "../util.js";

export const registerConfig: Register = (program) => {
  const config = program.command("config").description("Show or change settings");

  config.action(
    action(() => {
      const c = loadConfig();
      const e = resolveEmbedder(c);
      console.log(`Config file: ${configPath()}\n`);
      console.log(`embedder.provider  ${e.provider}`);
      console.log(`embedder.model     ${e.model}`);
      console.log(`embedder.baseUrl   ${e.baseUrl}`);
      if (e.provider === "openai") console.log(`OPENAI_API_KEY     ${e.apiKey ? "set" : "not set"}`);
      console.log(`agent              ${resolveAgent(c) ?? "(none)"}`);
      console.log(`ui.port            ${c.ui.port}`);
    }),
  );

  config
    .command("set <key> <value>")
    .description(`Set one of: ${CONFIG_KEYS.join(", ")}`)
    .action(
      action((key: string, value: string) => {
        let next;
        try {
          next = setConfigValue(loadConfig(), key, value);
        } catch (err) {
          throw new MemiError((err as Error).message);
        }
        saveConfig(next);
        console.log(`Set ${key} = ${value}`);
        if (!key.startsWith("embedder.")) return;
        const { warning } = openRuntime().store.status();
        if (warning) console.error(`\nWarning: ${warning}`);
      }),
    );
};
