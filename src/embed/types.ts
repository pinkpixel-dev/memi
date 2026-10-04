import type { Provider } from "../core/config.js";

export type EmbedKind = "document" | "query";

export interface Embedder {
  readonly provider: Provider;
  readonly model: string;
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}

export class EmbedError extends Error {}
