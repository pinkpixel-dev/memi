# memi overview

memi is a local-first memory system for AI agents. Everything lives in one SQLite file, and agents will talk to it through an MCP server. This file describes how it works right now, so it only covers what is actually built.

## Status

Phases 1 and 2 are done: the core store, search, and embeddings. The MCP server, CLI, local UI, and agent skills are not built yet. See `ROADMAP.md`.

## Where things live

- Database: `~/.memi/memi.db`
- Config: `~/.memi/config.json`
- `MEMI_HOME` moves both.

## How memories are stored

Each memory has content, a category, tags, an importance from 1 to 5, a pinned flag, and an optional agent name. It is either `global` or tied to one `project`.

Categories start with `decision`, `preference`, `fact`, `error`, `todo`, and `context`. Saving a memory with a new category name creates it.

## Which project is "this project"

`resolveProject` in `src/core/project.ts` checks these in order:

1. An explicit project name
2. `MEMI_PROJECT`
3. The folder name of the nearest git root
4. The agent name, stored as `agent:<name>` (set with `MEMI_AGENT` or `agent` in config)

If none of those exist, project memories can't be saved and the caller gets an error that says what to set.

The git root check uses the folder name only. Two repos with the same folder name will share a project id. Pass an explicit project name if that bites you.

## Search

`MemoryStore.search` runs two searches and merges them:

- Text: SQLite FTS5 with the porter stemmer, ranked by BM25. Queries are cleaned into quoted tokens joined with OR, so punctuation can't break them.
- Semantic: vector KNN with cosine distance, using `sqlite-vec`.

The two ranked lists are merged with reciprocal rank fusion. The score is then scaled by importance (0.9x to 1.3x) and a small recency bonus of up to 10 percent that halves every 60 days.

Modes are `hybrid` (default), `semantic`, and `text`. If vectors aren't usable, search falls back to text and says why in a `note`.

Scope filters are `both` (global plus the current project), `global`, `project`, and `all`.

## Embeddings

Two providers:

| Provider | Default model | Notes |
|---|---|---|
| Ollama | `nomic-embed-text` | Uses `/api/embed`. Adds the `search_document:` and `search_query:` prefixes that nomic expects. |
| OpenAI | `text-embedding-3-small` | Reads `OPENAI_API_KEY` from the environment only. It is never written to config. |

Set them in `config.json` or with `MEMI_EMBED_PROVIDER`, `MEMI_EMBED_MODEL`, `MEMI_OLLAMA_URL`, and `OPENAI_BASE_URL`.

The database records which provider, model, and dimension made its vectors. If you change the embedder, memi notices the mismatch and turns semantic search off with a warning. Nothing is deleted. Run a reindex and memi drops the vector table, rebuilds it for the new dimension, and re-embeds every saved memory. Your memories are kept. The embedding work happens before anything is dropped, so a failed reindex changes nothing.

A memory is always saved, even if the embedder is down. It just won't have a vector until you backfill.

When you save a memory, memi also returns any existing memories in the same scope within a cosine distance of 0.15. That is informational, it never blocks the save. With `embeddinggemma` and `qwen3-embedding`, near-duplicates measured about 0.03 to 0.05, related memories 0.33 to 0.42, and unrelated ones above 0.6.

## Code layout

```
src/core/   schema, db, config, project resolution, memories, search, vectors
src/embed/  Ollama and OpenAI providers
tests/      core.test.ts (no embedder), semantic.test.ts (real Ollama)
```

## Tests

`npx vitest run` runs everything. The semantic tests use real Ollama models (`embeddinggemma` and `qwen3-embedding:0.6b`) and skip themselves if those aren't pulled. Cold model loads can take 30 seconds or more.
