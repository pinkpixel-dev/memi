import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

// The frontend files live in ui/ at the package root. This path is the same from src/ui and dist/ui.
const ROOT = resolve(import.meta.dirname, "../../ui");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

export interface Asset {
  body: Buffer;
  type: string;
  cache: string;
}

/** Returns a file from ui/, or null. Only known file types, and never anything outside ui/. */
export async function readAsset(urlPath: string): Promise<Asset | null> {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (rel === "/" || rel === "") rel = "/index.html";
  if (rel.includes("\0") || rel.includes("\\")) return null;

  const file = resolve(join(ROOT, rel));
  const type = TYPES[extname(file)];
  if (!type || !file.startsWith(ROOT + sep)) return null;
  try {
    if (!(await stat(file)).isFile()) return null;
    return { body: await readFile(file), type, cache: type.startsWith("font/") || type === "image/svg+xml" ? "public, max-age=86400" : "no-cache" };
  } catch {
    return null;
  }
}
