import { loadConfig, resolveAgent, resolveEmbedder, type MemiConfig } from "./config.js";
import { openDb } from "./db.js";
import { MemoryStore } from "./memories.js";
import { createEmbedder } from "../embed/index.js";

export interface Runtime {
  store: MemoryStore;
  config: MemiConfig;
  agent: string | null;
}

/** Opens the database at its default location with whichever embedder the config and environment select. */
export function openRuntime(): Runtime {
  const config = loadConfig();
  const store = new MemoryStore(openDb(), createEmbedder(resolveEmbedder(config)));
  return { store, config, agent: resolveAgent(config) };
}
