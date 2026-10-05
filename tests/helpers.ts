import { openDb } from "../src/core/db.js";
import { MemoryStore } from "../src/core/memories.js";
import { OllamaEmbedder } from "../src/embed/ollama.js";
import type { Embedder } from "../src/embed/types.js";

export const OLLAMA_URL = process.env.MEMI_TEST_OLLAMA_URL ?? "http://localhost:11434";
/** The real default model. */
export const MODEL_A = "nomic-embed-text";
/** A second model with a different dimension (1024), only needed for the embedder-switch test. */
export const MODEL_B = process.env.MEMI_TEST_ALT_MODEL ?? "qwen3-embedding:0.6b";

export const newStore = (embedder: Embedder | null = null) => new MemoryStore(openDb(":memory:"), embedder);
export const ollama = (model: string, url = OLLAMA_URL) => new OllamaEmbedder(model, url);

/** True when a real Ollama server has every listed model pulled. */
export async function ollamaHas(...models: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const { models: installed } = (await res.json()) as { models: { name: string }[] };
    const names = installed.map((m) => m.name);
    return models.every((m) => names.some((n) => n === m || n === `${m}:latest`));
  } catch {
    return false;
  }
}

import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
export const CLI_ENTRY = join(root, "src/cli/index.ts");
/** Runs the TypeScript CLI directly. The absolute path lets it work from any cwd. */
export const NODE_ARGS = ["--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx/esm")).href];

export const tempDir = (prefix: string) => mkdtempSync(join(tmpdir(), `memi-${prefix}-`));

/** Environment for a child process: its own MEMI_HOME, no project or agent leaking in from the host. */
export function childEnv(home: string, extra: Record<string, string> = {}): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  for (const k of ["MEMI_PROJECT", "MEMI_AGENT", "MEMI_EMBED_PROVIDER", "MEMI_EMBED_MODEL", "OPENAI_API_KEY"]) delete env[k];
  return { ...env, MEMI_HOME: home, MEMI_OLLAMA_URL: OLLAMA_URL, ...extra };
}

/** An Ollama URL nothing listens on, for testing behaviour while the embedder is down. */
export const DEAD_OLLAMA = "http://127.0.0.1:1";
