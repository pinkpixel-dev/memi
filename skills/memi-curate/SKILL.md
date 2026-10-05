---
name: memi-curate
version: 1.0.0
description: |
  Review and clean up memories stored in memi: find duplicates, contradictions,
  stale or vague entries, wrong scope or category, inflated importance, and
  accidentally saved secrets, then fix them with the user's approval. Use when
  the user asks to "clean up", "review", "organize", or "audit" memories, when
  recall keeps returning noise or contradictory results, or when list_memories
  shows a large pile of low-value entries.
license: Apache-2.0
compatibility: claude-code cursor codex gemini-cli opencode
---

# Curating memi memories

Memories pile up. Over time a store collects near-duplicates, decisions that were later reversed, vague notes nobody can interpret, and categories that drifted. A messy store makes `recall` worse, because contradictory or noisy results waste attention and can lead the next session wrong.

This skill is a careful review. The rule that matters most: **deleting is permanent, so you propose first and the user approves.**

If the user would rather look through memories themselves, `memi ui` opens a browser view where they can search, edit, and delete.

## 1. Survey

1. `list_categories` for the shape of the store.
2. `list_memories` with `scope: "all"` and `limit: 50`, paging with `offset` until `total` is covered. Use `order: "importance"` to see what is loaded at session start first, then `order: "oldest"` for the stale tail.
3. If the user only cares about one project, use `scope: "project"` with that `project`. Include `scope: "global"` separately.

Read everything before you judge anything. A "duplicate" is easy to misjudge from one memory.

## 2. Look for these problems

| Problem | How to spot it | Fix |
|---|---|---|
| **Duplicate** | Two memories say the same thing | Keep the clearer one (`update_memory` to merge in any detail from the other), `forget` the rest |
| **Contradiction** | Two memories disagree | Decide which is current. Check the repo or ask the user if unsure. Update or keep that one, `forget` the other |
| **Stale** | Names a file, flag, host, or version that may no longer exist | Verify against the repo. If it changed, `update_memory`. If it is gone, `forget` |
| **Vague** | Cannot be understood without the original conversation ("use the second approach") | Rewrite so it stands alone if you can tell what it meant. Otherwise `forget` |
| **Wrong category** | Lots of `context` that is really a decision, preference, or fact | `update_memory` with the right `category` |
| **Wrong scope** | A project memory that is really a global preference, or the reverse | `update_memory` with `scope` (and `project` if moving to a project) |
| **Inflated importance** | A pile of 4s and 5s, or more than about five pinned memories per scope | Lower importance, unpin the rest |
| **Category sprawl** | Near-identical custom names (`ci`, `cicd`, `ci-cd`) | Move the memories into one category |
| **Secret** | An API key, token, password, or private key | Tell the user straight away, `forget` it, and tell them the secret should be rotated since it was stored |

Do not fix what is not broken. A short, plain memory that is correct is fine.

## 3. Propose before you change anything

Present a list the user can approve in one pass. Group by action, and give the id, the reason, and the new wording when you rewrite:

```
Delete (3)
  #14  duplicate of #9
  #31  vague: "use the second approach"
  #40  stale: refers to scripts/old-deploy.sh, which no longer exists

Update (2)
  #22  fact -> decision; reword: "Auth uses signed cookies, not JWTs, because sessions must be revocable."
  #27  scope project -> global (it is a tooling preference)

Lower importance (1)
  #8   5 -> 3

Secrets (0)
```

Then wait. Apply only what the user approves. If they approve some items, do those and leave the rest.

A secret is the one case where you should say so immediately and not wait for the end of the review. You still need approval before deleting.

## 4. Apply

- `update_memory` for rewording, recategorizing, rescoping, importance, tags, pinning. Changing `content` or scope re-embeds the memory.
- `forget` for deletions, one id at a time.
- Merging: update the best memory with the combined content, then `forget` the others.

Note that `update_memory` with `tags` **replaces** the existing tags. Pass the full list you want.

## 5. Report

End with plain counts: how many deleted, updated, left alone, and anything you were unsure about and skipped. If you could not check something against the repo, say so.

## Rules

- Never delete without approval.
- Never change the meaning of a memory while rewording it. If you are not sure what it meant, ask or leave it.
- Verify stale-looking details against the repo before calling them stale.
- Keep the user's own words where they are clear. Do not polish for the sake of it.
- If a warning like `Saved without a vector` appears while updating, mention it once and carry on.
