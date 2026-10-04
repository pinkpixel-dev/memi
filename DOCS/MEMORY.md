# Decisions

## 2026-10-04: Switching embedders rebuilds vectors instead of wiping the database

**Decided:** Changing the embedder drops and rebuilds only the vector table, then re-embeds the saved text. Memories are kept. The user is warned and has to confirm before it runs.

**Why:** Only the vectors depend on the model and its dimension. The memory text is the part you can't regenerate.

**Rejected:** A full database wipe. It was the first idea, but it throws away data that has nothing to do with the dimension change.

## 2026-10-04: TypeScript on Node, `better-sqlite3` and `sqlite-vec`

**Decided:** TypeScript, published as `@pinkpixel/memi`.

**Why:** It matches the existing release workflow around `package.json`, and the MCP TypeScript SDK is the reference one.

**Rejected:** Python (fastest to build, but a Python env on every machine) and Rust (a lot more code for the same first version).

## 2026-10-04: Project id comes from the git folder name, then the agent name

**Decided:** Explicit name, then `MEMI_PROJECT`, then git root folder name, then `agent:<name>`.

**Why:** It needs no setup in a normal repo, and agents without a repo still get a stable bucket.

**Tradeoff:** Two repos with the same folder name collide. An explicit project name is the escape hatch.

## 2026-10-04: Saving never fails because of the embedder

**Decided:** If the embedder is down or mismatched, the memory is saved without a vector and the result carries a warning. Backfill fills the gap later.

**Why:** Losing a memory because Ollama was off is worse than having it missing from semantic search for a while.

## 2026-10-04: Official MCP SDK 1.x

**Decided:** Use `@modelcontextprotocol/sdk` 1.x.

**Why:** It is the stable line on npm. The docs also show a v2 alpha under `@modelcontextprotocol/server` with different import paths, so check imports against the version installed when wiring up Phase 3.
