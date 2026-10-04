import { EmbedError } from "./types.js";

export async function postJson<T>(url: string, body: unknown, headers: Record<string, string>, hint: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new EmbedError(`Could not reach ${url}: ${(err as Error).message}. ${hint}`);
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new EmbedError(`${url} returned ${res.status}: ${text}. ${hint}`);
  }
  return (await res.json()) as T;
}
