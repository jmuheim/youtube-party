---
name: decision-log
description: "Use whenever adding, revising, or superseding an entry in docs/decisions.md — e.g. when a PR makes or changes an architectural decision, when a planning discussion settles a design question, or when an existing decision is reversed or refined. Trigger on tasks that mention docs/decisions.md, 'log this decision', 'add a decision entry', or that change something an existing decision entry describes."
---

# Decision log conventions

`docs/decisions.md` is an append-only, numbered log of *why* things are the way they are. It is the source of truth for rationale; `CLAUDE.md` and the skills describe *how*, the README describes *what*.

## Adding a new entry

1. **Find the next number**: `grep "^### " docs/decisions.md | tail -1` and increment. Numbers are sequential with no gaps — double-check after inserting (past mistakes: gaps from renumbering).
2. **Append at the end** of the file, separated by `---` on its own line, blank lines around it.
3. **Heading format**: `### <n>. <Short assertive title>` — the title states the decision, not the topic (e.g. "Votes are advisory; the creator orders the queue manually", not "Voting").
4. **Body structure** (bold lead-ins, in this order, omitting sections that don't apply):
   - `**Decision:**` — what was decided, concrete and self-contained. For future/not-yet-built directions, mark it explicitly: "(design capture, not scheduled work)" or "(direction capture, explicitly gated)".
   - `**Why:**` — the actual reasoning, including alternatives considered and rejected. This is the most valuable part; don't compress it to a platitude. Named "Why <specific question>" when there are several distinct whys.
   - `**Implication:**` / `**Watch for:**` / `**Revisit:**` — what this changes elsewhere, known risks, and the concrete trigger for reconsidering.
5. **Cross-reference** related decisions by number (`#22`) and related files by path (``the `playback-crossfade` skill``). If the new entry affects an older one, update the older one too (see below).
6. **Line wrapping:** one line per paragraph — do NOT hard-wrap prose
   at a fixed column. Each paragraph, list item, and blockquote is a
   single unbroken line, soft-wrapped by the editor. (Blank lines still
   separate paragraphs; this is about not inserting newlines *within* a
   paragraph.) This keeps every Markdown renderer from turning
   mid-paragraph line breaks into visible breaks — see decision #38.

## Revising or superseding an existing entry

- **Never delete or rewrite history.** A superseded entry keeps its original text and gets a blockquote note directly under its heading: `> **Superseded by #<n>.** <one-line summary of what changed and where the current behavior lives.>`
- Partial updates (decision still stands, detail changed) get a `> **Note:** as of #<n>, …` blockquote, or a clearly-marked appended paragraph (e.g. "**Backend (added with the Rails 8 decision, #32):**").
- Field/name changes get a short italic parenthetical documenting the rename and why (see #22's note on `start_has_clear_beat`).

## When to add an entry at all

Add one for: architectural choices, scope cuts/deferrals, reversals, rejected-alternative records ("considered and rejected: …" — these prevent re-exploration), process rules, and anything a future reader would otherwise have to reverse-engineer from code. Don't add entries for routine implementation details with no alternative worth naming.

One review/discussion producing many small related items can be a single package entry (see #31) rather than eight fragments — favor signal over granularity.
