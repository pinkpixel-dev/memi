# Rubrics for memi memories

Use these when the choice of importance, category, scope, or pinning is not obvious.

## Importance

| Level | Meaning | Examples |
|---|---|---|
| 1 | Minor. Nice to know, harmless to forget. | "The old build script is in `scripts/legacy/`." |
| 2 | Useful detail. | "Dev server runs on port 5174 because 5173 is taken." |
| 3 | Normal. Default. Worth having next session. | "API errors use the `{ error, code }` shape." |
| 4 | Important. Getting it wrong costs real time. Loaded by `get_context`. | "Never run migrations on the shared staging database without asking." |
| 5 | Critical. A rule or fact that must never be missed. Loaded by `get_context`. | "Production deploys are manual. Never trigger one from a script." |

Most memories should be 2 or 3. If everything is a 4 or 5, `get_context` stops being useful. Search results are also nudged by importance, so inflating it distorts ranking.

## Pinning

Pinned memories load at the start of every session whatever their importance. Pin only what would hurt if a session started without it. A reasonable ceiling is about five pinned memories per scope. If you want to pin a sixth, unpin or merge one first.

Pinning and importance 4 or 5 do the same job for `get_context`. Use importance for "this matters" and pinning for "this must always be loaded". In practice you rarely need both.

## Categories

| Category | Use for | Not for |
|---|---|---|
| `decision` | A choice that was made, with the reason, and ideally what was rejected | Preferences with no trade-off |
| `preference` | How the user likes things done | Facts about the system |
| `fact` | Durable truth about the project, system, or user | Anything that will be false next week |
| `error` | Something that failed, what caused it, and the fix | Bugs that are already fixed and will not recur |
| `todo` | Work explicitly deferred | Your own in-session task list |
| `context` | Background that helps orient a future session (the default) | Anything that fits a more specific category |

Custom categories are created the first time you use a name. Keep them short and lowercase (letters, numbers, dashes, underscores, up to 32 characters). Run `list_categories` first, because `ci` and `cicd` splitting the same topic helps nobody. Prefer a built-in category unless a custom one will hold several memories.

## Scope

| Question | If yes |
|---|---|
| Is it about the user, how they work, or their tools across projects? | `global` |
| Would it be wrong or confusing in a different project? | `project` |
| Is it a coding convention for one repo? | `project` |
| Is it a personal preference that applies to every repo (tabs, tone, tools)? | `global` |
| Not sure? | `project`. It is easier to promote later (`update_memory` with `scope: "global"`) than to find a stray global memory. |
