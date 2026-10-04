import { postJson } from "./http.js";
import { EmbedError, type EmbedKind, type Embedder } from "./types.js";

// nomic-embed-text expects a task prefix on its inputs.
const PREFIXES: Record<string, Record<EmbedKind, string>> = {
  "nomic-embed-text": { document: "search_document: ", query: "search_query: " },
};

export class OllamaEmbedder implements Embedder {
  readonly provider = "ollama" as const;
  constructor(
    readonly model: string,
    private readonly baseUrl: string,
  ) {}

  async embed(texts: string[], kind: EmbedKind): Promise<number[][]> {
    const base = this.model.replace(/:latest$/, "");
    const prefix = PREFIXES[base]?.[kind] ?? "";
    const data = await postJson<{ embeddings?: number[][] }>(
      `${this.baseUrl}/api/embed`,
      { model: this.model, input: texts.map((t) => prefix + t) },
      {},
      `Is Ollama running? You may need: ollama pull ${this.model}`,
    );
    if (!data.embeddings || data.embeddings.length !== texts.length) {
      throw new EmbedError(`Ollama returned an unexpected response for model ${this.model}.`);
    }
    return data.embeddings;
  }
}
