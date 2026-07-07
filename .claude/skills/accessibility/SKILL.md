---
name: accessibility
description: "Use when writing or reviewing any HTML/view/template in this app, or any interactive UI element (buttons, forms, modals, live-updating content, focus behavior). Trigger on tasks involving markup, ARIA, keyboard navigation, screen readers, or focus management — this app has a hard requirement to be fully usable via keyboard alone and with a screen reader."
---

# Accessibility

Accessibility is a hard requirement, not a polish pass. The app must be fully usable via **keyboard alone** and with a **screen reader**.

**Guiding principle:** semantic HTML first. Reach for ARIA only when HTML genuinely can't express the interaction — don't use `aria-label`, `role`, etc. as a substitute for correct markup.

**Anything worth announcing in an `aria-live` region is worth showing visually too.** An `aria-live` region exposes information to screen reader users that sighted users are missing an equally clear signal for — the fix is a visible UI element for everyone, with `aria-live` making sure it's also announced, not a screen-reader-only side channel. Treat "we need an `aria-live` region here" as a prompt to check the visible UI is actually communicating the same thing, not just as a non-visual patch. E.g. a live-updating vote count needs a visible number that updates, not just an announcement while the visible count lags or is absent; "Song added by X" needs to actually appear in the visible list, not just be spoken. If something feels like it only needs an `aria-live` announcement and no visible counterpart, that's usually a sign the visual design is missing something, not that the live region is sufficient on its own.

- Use real `<button>` elements for actions, real `<a href>` for navigation — never a `<div>` or `<span>` with a click handler standing in for either.
- Use native form elements (`<label for>`, `<fieldset>`/`<legend>`, `<input>`, `<select>`) so labels, grouping, and states are conveyed for free. A visible, associated `<label>` beats an `aria-label` every time.
- Structure pages with real headings (`<h1>`–`<h6>`) in a logical order, and landmark elements (`<nav>`, `<main>`, `<header>`, `<footer>`) instead of generic `<div>`s with ARIA roles bolted on.
- Ordered/unordered lists (`<ol>`/`<ul>`) for the song list, not a `<div>` soup — the playlist is inherently a list, and it should read as one.

**Where ARIA is appropriate** (HTML has no equivalent):
- `aria-live` regions for real-time notifications — e.g. announcing "Song added by X" or vote count changes from Turbo Stream broadcasts, so screen reader users aren't left out of updates sighted users see happen live. The live region should be announcing something already visible on screen (the song appearing in the list, the count updating in place), not carrying information that only exists for screen reader users.
- `aria-current` for indicating the currently playing song, if/when playback is added.
- Disabled controls need an explanation, not just an inert state — but that explanation belongs on the control itself (`aria-disabled` + a descriptive accessible name, e.g. "Skip to next song, unavailable during transition"), not a proactive `aria-live` announcement. A live-region push is for updates to content the user isn't looking at; a control's own disabled reason is better conveyed on the control, spoken only when the user actually interacts with it. This also avoids a real problem specific to this app: on the playback device, screen-reader speech shares the same audio output as the party's actual mix, so an unsolicited spoken announcement would play over the music. See the `playback-crossfade` skill's "Interrupting and cancelling transitions safely" for the concrete instance.
- `aria-expanded`/`aria-controls` for any custom disclosure widgets, if a case arises where a native `<details>`/`<summary>` isn't sufficient.

**Focus handling** — this matters especially given the live-update and Turbo Frame/Stream-heavy UI:
- After a Turbo Stream update inserts new content (e.g. a newly suggested song), don't steal focus from whatever the user was doing — but do make sure the update is announced via an `aria-live` region.
- After an action that removes the focused element (e.g. a song being removed from the list), move focus somewhere sensible — not back to `<body>` by default.
- Modal/dialog-like UI (if any) must trap focus while open and restore focus to the triggering element on close. Prefer the native `<dialog>` element over a hand-rolled modal.
- Every interactive element must have a visible focus indicator — don't suppress the default focus outline without providing an equivalent replacement.
- Test keyboard flows manually (Tab/Shift+Tab, Enter/Space, Escape) for every new interactive feature before considering it done, not just after the fact.

When implementing a new interactive feature, check semantic HTML and keyboard/focus behavior as part of the feature — not as a follow-up task.
