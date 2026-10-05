# Examples

## Rewriting vague memories

| Before | After | What changed |
|---|---|---|
| `Use the new approach.` | `Search runs FTS5 and vector KNN, merged with reciprocal rank fusion, because either alone missed too much.` | Named the approach and gave the reason. |
| `User likes it short.` | `Prefers short answers with no closing summary. Said so on 2026-10-04.` | Said what "it" is, added a date. |
| `Fixed the bug with the thing.` | `Uploads over 10MB failed because the proxy limit is 10MB. Raised it in nginx.conf to 50MB.` | Named the symptom, the cause, and the fix. |
| `Don't forget to test on mobile.` | `Every UI change must be checked at 375px width. The app is used mostly on phones.` | Made the rule concrete. |

## What not to save

| Candidate | Why not |
|---|---|
| `The project uses TypeScript.` | Visible from the repo. |
| `Currently refactoring the auth module.` | Session progress. It will be wrong tomorrow. |
| `The API key is sk-...` | A secret. Never. |
| `Maybe we should use Redis?` | A guess, not a decision. |
| A pasted 300-line stack trace | Too long. Save the cause and the fix in two sentences. |

## A duplicate, handled

You call `remember` with `The user prefers tabs over spaces`. The result says:

```
Saved memory #14 (global, preference, importance 3).

Similar memories already exist. If one covers this, call update_memory on it and forget #14:
#9 | preference | importance 4 | global | 2026-09-12
The user prefers tabs over spaces for indentation
```

Memory #9 already says it, and with more detail. So delete the new one:

1. `forget` with `{ "id": 14 }`

If the new wording were better, you would first call `update_memory` on #9 with the improved `content`, then forget #14.

## Session start

1. Call `get_context`. It returns, say, four memories: two pinned rules, two important decisions.
2. Use them silently. If the user asks to change something a decision covers, mention the decision and why it was made.
3. Later the user says "let's add caching". Call `recall` with `caching decisions and constraints` before proposing anything.

## A memory that turned out wrong

`recall` returns `#22 | fact | ... | The staging database is at db-staging-1.` While working you find the host is now `db-staging-2`.

Call `update_memory` with `{ "id": 22, "content": "The staging database is at db-staging-2 (moved from db-staging-1 on 2026-10-04)." }`. Do not save a second memory next to it.
