import type { MiddlewareHandler } from "hono";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Memory text is untrusted (an agent can save anything), so the page may only load its own files.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const forbidden = (message: string, status: 403 | 415) => Response.json({ error: message }, { status });

/**
 * The UI can delete memories, so a web page you happen to have open must not be able to drive it.
 * - Host check: stops DNS rebinding, where evil.example resolves to 127.0.0.1.
 * - Origin check and JSON-only bodies: stops cross-site writes. A cross-origin JSON request needs a
 *   CORS preflight, and this server never answers one.
 */
export const guard: MiddlewareHandler = async (c, next) => {
  const url = new URL(c.req.url);
  if (!LOCAL_HOSTS.has(url.hostname)) return forbidden("Forbidden host.", 403);

  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("origin");
    if (origin) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host;
      } catch {
        // "null" and other unparseable origins are rejected below.
      }
      if (originHost !== url.host) return forbidden("Forbidden origin.", 403);
    }
    if (c.req.method !== "DELETE" && !c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
      return forbidden("Send JSON.", 415);
    }
  }

  await next();
  c.header("Content-Security-Policy", CSP);
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Frame-Options", "DENY");
};
