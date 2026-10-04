import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const ProviderSchema = z.enum(["ollama", "openai"]);
export type Provider = z.infer<typeof ProviderSchema>;

const ConfigSchema = z.object({
  embedder: z
    .object({
      provider: ProviderSchema.default("ollama"),
      model: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .default({ provider: "ollama" }),
  agent: z.string().optional(),
  ui: z.object({ port: z.number().int().default(4747) }).default({ port: 4747 }),
});
export type MemiConfig = z.infer<typeof ConfigSchema>;

export interface ResolvedEmbedder {
  provider: Provider;
  model: string;
  baseUrl: string;
  apiKey?: string;
}

export function memiHome(): string {
  return process.env.MEMI_HOME || join(homedir(), ".memi");
}

export const dbPath = () => join(memiHome(), "memi.db");
export const configPath = () => join(memiHome(), "config.json");

export function loadConfig(): MemiConfig {
  let raw: unknown = {};
  if (existsSync(configPath())) {
    try {
      raw = JSON.parse(readFileSync(configPath(), "utf8"));
    } catch (err) {
      throw new Error(`Could not read ${configPath()}: ${(err as Error).message}`);
    }
  }
  return ConfigSchema.parse(raw);
}

export function saveConfig(config: MemiConfig): void {
  mkdirSync(memiHome(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n");
}

const DEFAULTS: Record<Provider, { model: string; baseUrl: string }> = {
  ollama: { model: "nomic-embed-text", baseUrl: "http://localhost:11434" },
  openai: { model: "text-embedding-3-small", baseUrl: "https://api.openai.com/v1" },
};

/** Config file first, then env overrides. The OpenAI key only ever comes from the environment. */
export function resolveEmbedder(config: MemiConfig = loadConfig()): ResolvedEmbedder {
  const provider = ProviderSchema.parse(process.env.MEMI_EMBED_PROVIDER ?? config.embedder.provider);
  const defaults = DEFAULTS[provider];
  const configured = config.embedder.provider === provider ? config.embedder : undefined;
  const envBase = provider === "ollama" ? process.env.MEMI_OLLAMA_URL : process.env.OPENAI_BASE_URL;
  return {
    provider,
    model: process.env.MEMI_EMBED_MODEL ?? configured?.model ?? defaults.model,
    baseUrl: (envBase ?? configured?.baseUrl ?? defaults.baseUrl).replace(/\/+$/, ""),
    apiKey: provider === "openai" ? process.env.OPENAI_API_KEY : undefined,
  };
}

export function resolveAgent(config: MemiConfig = loadConfig()): string | null {
  return process.env.MEMI_AGENT?.trim() || config.agent?.trim() || null;
}
