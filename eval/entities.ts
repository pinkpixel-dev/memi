/**
 * Heuristic entity extraction for the graph-recall eval. No LLM: it picks out code-shaped names
 * (backticked spans, paths, kebab/snake/camel case, dotted names, acronyms) and capitalized names
 * that are not at the start of a sentence.
 */

const STOPWORDS = new Set(
  "a an and are as at be but by for from has have if in into is it its no not of on or so that the then this to was were with without".split(" "),
);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER = /^v?[\d.,%~]+$/;

/** Lowercase tokens with a light plural strip, shared by entities and queries so they match. */
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

function normalize(raw: string): string | null {
  const s = raw.trim().replace(/^[("'[]+|[)"'\].,;:!?]+$/g, "").toLowerCase();
  if (s.length < 2 || DATE.test(s) || NUMBER.test(s)) return null;
  const t = tokens(s);
  if (!t.length || t.every((w) => STOPWORDS.has(w))) return null;
  return s;
}

const CODE_SHAPED = [
  /\p{Ll}\p{Lu}/u, // camelCase / PascalCase with an inner capital
  /[_/@]/, // snake_case, paths, scoped packages
  /\p{L}[-.]\p{L}/u, // kebab-case, dotted names, file names
  /^\p{Lu}[\p{Lu}\p{N}]+$/u, // acronyms like MCP, FTS5
  /\p{L}\p{N}|\p{N}\p{L}/u, // mixed letters and digits like 1080p, Qwen3
];

export function extractEntities(text: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const n = normalize(raw);
    if (n) out.add(n);
  };

  for (const m of text.matchAll(/`([^`]+)`/g)) add(m[1]!);

  for (const m of text.matchAll(/[@~]?[\p{L}\p{N}][\p{L}\p{N}._/@-]*[\p{L}\p{N}]/gu)) {
    if (CODE_SHAPED.some((re) => re.test(m[0]))) add(m[0]);
  }

  // Runs of capitalized words, skipping the first word of each sentence or clause.
  for (const sentence of text.split(/(?<=[.!?:;])\s+|\n+|\(/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    let run: string[] = [];
    const flush = () => (run.length && add(run.join(" ")), (run = []));
    words.forEach((w, i) => {
      const clean = w.replace(/^[("'`]+|[)"'`.,;:!?]+$/g, "");
      const capital = /^\p{Lu}/u.test(clean) && i > 0;
      if (capital) run.push(clean);
      else flush();
      if (capital && /[.,;:!?)]$/.test(w)) flush();
    });
    flush();
  }

  return [...out];
}
