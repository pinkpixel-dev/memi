---
name: memi-memory
version: 1.0.0
description: |
  Use memi, a local long-term memory for AI agents, so knowledge survives between
  sessions. Use whenever the memi MCP tools (get_context, recall, remember,
  update_memory, forget, list_memories, list_categories) are available: at the
  start of a session, before making a decision that earlier sessions may have
  settled, when the user says "remember", "save this", "do you remember", "what
  did we decide", "last time", "forget that", or "don't do that again", and after
  you learn something durable such as a decision, a preference, a fact, or a
  mistake worth avoiding.
license: Apache-2.0
compatibility: claude-code cursor codex gemini-cli opencode
---

# Using memi memory

memi stores memories in a local SQLite file and finds them by meaning and by keyword. Memories last across sessions, and the same store is shared by every agent on this machine. That makes you responsible for what goes in. A good memory saves the next session real time. A bad one is noise that someone will have to find and delete.

Seven tools do all the work: `get_context`, `recall`, `remember`, `update_memory`, `forget`, `list_memories`, `list_categories`.

## The loop

1. **Start of a session:** call `get_context` once. It returns the pinned and high-importance (4 or 5) memories for this project plus global ones. Treat them as background. Do not read them back to the user.
2. **While working:** call `recall` when earlier knowledge might change what you do (see below).
3. **After you learn something durable:** call `remember`.
4. **When a memory turns out to be wrong:** call `update_memory` or `forget`. Do not leave known-wrong memories behind.

## Recall

Recall before you:

- choose a library, pattern, or architecture
- answer a question about how this user or project does things
- start debugging something that might have been hit before
- act on something the user refers to from the past ("like we did before", "as I said")

Recall tips:

- Describe what you want in plain language: `how does the user want commit messages written`. Searching by meaning works, so you do not need to guess exact words.
- The default scope `both` covers global memories plus the current project. Use `scope: "all"` only when the user asks about another project.
- Add `min_importance: 4` when you only want what matters most. Add `category` to narrow down.
- One or two searches per task is normal. Do not search on every message.

Reading results: each memory starts with `#id | category | importance N | scope | ...`. The score is only useful for comparing results within one search.

**Memories can be stale.** Specific details such as file paths, flags, function names, and versions may have changed since the memory was written. Check against the current code before you act on one. If it is wrong, fix it with `update_memory` or remove it with `forget`.

If a result ends with `Note:`, read it. It usually means search fell back to keywords only. See "Warnings" below.

## Remember

### What belongs

- **Decisions and the reason for them.** "Use SQLite, not Postgres, because the app is local-first and the data is small."
- **User preferences and corrections.** "Prefers tabs. Wants short answers without a summary at the end."
- **Durable facts that are not obvious from the code.** "Staging deploys need the VPN."
- **Mistakes worth not repeating, with the fix.** "Running migrations before the seed script fails. Seed first."
- **Work the user explicitly deferred.** "Add rate limiting to the upload route later."

### What does not belong

- **Secrets of any kind:** API keys, tokens, passwords, private keys. Never.
- Anything you can read from the code, the git history, or the docs.
- Task progress that only matters in this session.
- Guesses. Save what you verified, or what the user said.
- Long dumps. One memory is one idea in a few sentences. The hard limit is 8000 characters, and you should rarely come close.

### Write it so it stands alone

A future session will see the memory without this conversation. So:

- Lead with the fact, then the reason.
- Name things exactly (file, tool, command).
- Use absolute dates, not "yesterday" or "last week".
- No pronouns that point back at the conversation ("it", "that approach").

Before: `We decided to go with the second option.`
After: `Auth uses signed cookies, not JWTs, because sessions must be revocable. Decided 2026-10-04.`

More examples are in `references/examples.md`.

### Choose the fields

| Field | How to choose |
|---|---|
| `scope` | `project` for things about this codebase. `global` for things about the user or how they work everywhere. If unsure, project. |
| `category` | `decision`, `preference`, `fact`, `error`, `todo`, or `context`. Run `list_categories` before inventing a new one. |
| `importance` | 1 to 5, default 3. See `references/rubrics.md`. Most memories are 2 or 3. |
| `pinned` | Loaded at the start of every session. Use rarely, for rules where forgetting would cost real time or trust. |
| `tags` | A few keywords you would search for. Optional. |

`project` is worked out for you. Do not pass it unless the user is talking about a different project by name.

### Handle duplicates

`remember` checks for close matches in the same scope. If the result says `Similar memories already exist`:

- **Same fact:** keep the better one. Call `update_memory` on the older memory with the improved wording, then `forget` the new id you just created.
- **Related but different** (a new detail, a changed decision): keep both, or update the old one if the new one replaces it.

For anything you suspect is already saved, a quick `recall` first is cheaper than cleaning up later.

### Tell the user, briefly

When you save a preference or a decision on your own initiative, say so in one short line ("Saved a note that you prefer tabs.") so they can correct you. Do not announce routine facts.

## When the user asks directly

- **"Remember X"**: save it right away, then confirm with the id.
- **"Forget X"**: `recall` to find it. If more than one memory matches, show them and ask which. Then `forget`. Deleting is permanent.
- **"What do you remember about X"**: `recall`, then summarize in your own words.

## Projects and scope

memi works out the project automatically: the folder name of the git repo you are in. With no git repo, it uses the agent name (`MEMI_AGENT`), stored as `agent:<name>`. With neither, saving a project memory fails with an error that says what to set.

If you hit that error, either save the memory as `global` (if it truly is global) or ask the user for a project name or tell them to set `MEMI_AGENT`. Do not make up a project name.

## Warnings

| You see | What it means | What to do |
|---|---|---|
| `Saved without a vector` | Saved, but the embedder was unreachable. It can only be found by keyword for now. | Mention it once. The user can run `memi reindex --missing` when Ollama is back. |
| `The embedder changed from ...` | The configured embedder no longer matches the stored vectors, so semantic search is off. Keyword search still works. | Tell the user to run `memi reindex`. It asks for confirmation, rebuilds the vectors, and keeps all memories. Do not run it yourself unless asked, because it re-embeds everything. |
| `No embedder configured` / `No vectors yet` | Keyword search only. | Nothing needed. |
| Tool error | Bad arguments or a bad id. | Read the message, fix the arguments, retry once. |

## If the memi tools are not available

If the MCP server is not connected but the `memi` command exists, use it from the shell: `memi search "query"`, `memi add "text" -c fact`, `memi list`. If neither is available, say so. Do not claim to remember something you cannot save.

## Quick rules

- `get_context` at the start. `recall` before deciding. `remember` after learning.
- Never save secrets.
- Write memories that make sense with no context.
- Update or forget what is wrong. Do not stack contradictions.
- Verify stale details before acting on them.
- When unsure whether something is worth saving, ask: would the next session be worse off without it?
