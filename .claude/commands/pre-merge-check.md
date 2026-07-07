---
description: Walk the pre-merge checklist against the current branch
---

Run through the pre-merge checklist from `CLAUDE.md` ("Git & pull
request workflow") against the current branch, and report each item as
pass/fail/needs-attention with specifics:

1. **Tests exist for new/changed behavior** — diff the branch against
   the default branch; for each behavioral change, identify the spec
   covering it (system spec for user-facing flows per the
   `testing-conventions` skill, unit spec otherwise). List uncovered
   changes.
2. **Full suite passes** — run the whole test suite (not just changed
   specs) and report results.
3. **Lint/format clean** — run the linter on the branch's changed files
   and report offenses.
4. **PR title/description accuracy** — read the current PR title and
   description (e.g. via `gh pr view`) and compare against the actual
   diff. Flag anything the description claims but the diff doesn't do,
   and anything the diff does that the description omits.
5. **Docs current** — check whether the diff makes any doc stale:
   `README.md`, `CLAUDE.md`, `docs/decisions.md` (does this PR embody a
   decision that needs an entry? use the `decision-log` skill),
   `docs/roadmap.md`, skills under `.claude/skills/`, `.env.example`,
   and inline comments describing changed behavior. List each stale
   spot with a suggested fix.

Finish with a single verdict: ready to merge, or a short ordered list
of what to fix first. Do not fix anything unless asked — this command
is a check, not an auto-repair.
