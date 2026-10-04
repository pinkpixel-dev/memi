import { postJson } from "./http.js";
import { EmbedError, type Embedder } from "./types.js";

export class OpenAIEmbedder implements Embedder {
  readonly provider = "openai" as const;
  constructor(
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) throw new EmbedError("OPENAI_API_KEY is not set. Export it in the environment that runs memi.");
    const data = await postJson<{ data?: { index: number; embedding: number[] }[] }>(
      `${this.baseUrl}/embeddings`,
      { model: this.model, input: texts, encoding_format: "float" },
      { authorization: `Bearer ${this.apiKey}` },
      "Check OPENAI_API_KEY and the model name.",
    );
    if (!data.data || data.data.length !== texts.length) {
      throw new EmbedError(`OpenAI returned an unexpected response for model ${this.model}.`);
    }
    return [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
}
