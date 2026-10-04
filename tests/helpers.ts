import { openDb } from "../src/core/db.js";
import { MemoryStore } from "../src/core/memories.js";
import { OllamaEmbedder } from "../src/embed/ollama.js";
import type { Embedder } from "../src/embed/types.js";

export const OLLAMA_URL = process.env.MEMI_TEST_OLLAMA_URL ?? "http://localhost:11434";
export const MODEL_A = "embeddinggemma";
export const MODEL_B = "qwen3-embedding:0.6b";

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
