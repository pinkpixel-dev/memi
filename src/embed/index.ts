import { resolveEmbedder, type ResolvedEmbedder } from "../core/config.js";
import { OllamaEmbedder } from "./ollama.js";
import { OpenAIEmbedder } from "./openai.js";
import type { Embedder } from "./types.js";

export type { Embedder } from "./types.js";
export { EmbedError } from "./types.js";

export function createEmbedder(resolved: ResolvedEmbedder = resolveEmbedder()): Embedder {
  return resolved.provider === "openai"
    ? new OpenAIEmbedder(resolved.model, resolved.baseUrl, resolved.apiKey)
    : new OllamaEmbedder(resolved.model, resolved.baseUrl);
}
