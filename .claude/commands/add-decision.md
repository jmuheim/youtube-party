---
description: Append a correctly-numbered entry to docs/decisions.md
---

Add a new decision entry to `docs/decisions.md` about: $ARGUMENTS

Follow the `decision-log` skill's conventions exactly:
1. Determine the next sequential number (check the last `### ` heading;
   verify no gaps).
2. Append at the end after a `---` separator.
3. Use the Decision / Why / Implication–Watch for–Revisit structure with
   an assertive title.
4. Cross-reference related decisions by number and related files by
   path; if this supersedes or amends an earlier entry, add the
   appropriate blockquote note to that entry as well.
5. Hard-wrap at ~72–75 chars.

If the decision also changes current behavior described in `README.md`,
`CLAUDE.md`, or a skill, update those files in the same pass (per the
pre-merge checklist).
