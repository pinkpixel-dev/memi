---
name: memi-dream
version: 1.0.0
description: |
  Look back over the current session and fold what was learned into memi:
  capture decisions, preferences, corrections, facts, and fixes that were never
  saved, strengthen memories the session confirmed, and tidy the memories the
  session touched. Use at the end of a session or a long stretch of work, when
  the user says "dream", "save what we learned", "wrap up memory", "session
  end", "wrapping up", or "let's stop here", or after a session full of
  corrections or decisions. For a full audit of the whole store, use
  memi-curate instead.
license: Apache-2.0
compatibility: claude-code cursor codex gemini-cli opencode
---

# Dreaming with memi

During a session, agents save what they notice in the moment. A lot slips through: a correction the user gave twice, a decision that only became clear at the end, a fix that worked after three failed tries. Dreaming is a pass over the session, done after the work, that catches those and folds them into memory.

It is named after what sleep does for people: replay the day, keep what matters, drop the noise, and connect it to what you already knew.

Dreaming is not a full cleanup. It only looks at this session and the memories near it. When the whole store needs an audit, use `memi-curate`.

## 1. Look back over the session

Read back through the conversation and list candidates. Look for:

- **Decisions** that were made, and the reason given. Include anything that was considered and turned down.
- **Corrections** from the user. A correction given twice is a strong signal.
- **Preferences** the user stated or showed ("shorter answers", "don't touch main").
- **Errors and fixes.** What failed, why, and what worked. An approach that took several tries is worth saving.
- **Facts** that took effort to find and are not obvious from the code.
- **Work the user deferred** ("let's do that later").
- **Patterns.** The same mistake twice, a workflow the session kept coming back to, a question the user had to answer more than once.

Then filter with the bar from `memi-memory`. Drop anything that is:

- already readable from the code, the git history, or the docs
- progress that only matters to this session
- a guess, or something you did not verify
- a secret of any kind

If nothing is left, say so and stop. A quiet session is a fine result.

## 2. Compare against what is stored

For each candidate, `recall` it in plain language. Use the default scope, and `scope: "global"` for preferences about the user. Also run `list_memories` with `order: "recent"` to see what was saved or updated during this session, since those are often the closest neighbors.

Sort each candidate into one bucket:

| Bucket | Meaning | Action |
|---|---|---|
| **New** | Nothing like it is stored | `remember` it |
| **Confirmed** | A stored memory says the same thing, and the session backed it up | Leave the content alone. If it came up again because it was missed, raise `importance` by one |
| **Sharper** | A stored memory covers it, but the session added a detail or a reason | `update_memory` with the combined wording |
| **Changed** | The session reversed or replaced a stored memory | Propose an update or a delete (see step 4) |
| **Already saved** | Saved earlier in this session | Skip it, but check the wording still stands alone |

This is how dreaming sees across sessions. memi cannot read old transcripts, but it can read old memories. When a session repeats something a memory already warned about, that is the pattern. Make the memory clearer or more important so the next session catches it sooner.

## 3. Tidy the neighborhood

Look at every memory you touched and every memory your recalls returned. Run the `memi-curate` checks on this small set only:

- **Duplicate:** two memories say the same thing.
- **Contradiction:** two memories disagree, often because the session changed a decision.
- **Stale:** names a file, flag, or version that the session showed has changed. Verify against the repo first.
- **Vague:** cannot be understood without the conversation it came from.

Do not wander into the rest of the store. If you notice a bigger mess, say so and suggest running `memi-curate`.

## 4. What you can do on your own, and what needs approval

Adding to memory is low risk, and `memi-memory` already lets you save on your own. Changing or removing what someone wrote is not.

**Do it, then report:**

- `remember` new memories.
- `update_memory` to add detail without changing the meaning.
- Raise `importance` by one for a confirmed memory.
- Fix wording on memories saved earlier in this session.

**Propose first, then wait:**

- Any `forget`.
- Any update that changes what a memory means, such as a reversed decision.
- Changes to pinned memories, and pinning anything new.
- Moving a memory between `global` and a project.
- Any change to a memory written by a different agent (check the `agent` field).

Present the proposals in one list the user can approve in a single pass:

```
Update (1)
  #12  decision reversed this session; reword: "Recall counts live in the recalls table, not a column on memories."

Delete (1)
  #31  duplicate of #12

Pin (0)
```

Apply only what the user approves.

## 5. Report

Keep it short. Counts, then the ids:

```
Dreamed over this session.
  Saved 3: #44 #45 #46
  Sharpened 1: #12
  Raised importance 1: #8 (3 -> 4, same mistake came up again)
  Waiting on you: 2 (listed above)
```

If you could not verify something, or skipped a candidate because you were unsure what it meant, say so.

## Rules

- Never save secrets. If one appears in the session, do not store it, and tell the user it may need rotating.
- Never delete or change meaning without approval.
- Only use what happened in this session and what is already stored. Do not invent patterns from a single moment.
- Write every memory so it stands alone, with absolute dates. Follow `memi-memory` for fields, scope, and importance.
- Keep the user's own words where they are clear.
- Dreaming does not replace saving as you go. It catches what was missed.
- If a warning like `Saved without a vector` appears, mention it once and carry on.
