# CLAUDE.md

Guidance for AI assistants (and humans) working in this codebase. Keep this file up to date as real architectural decisions get made during implementation — it should always reflect how the app *actually* works, not just how it was planned.

## Build order

The two riskiest, most foundational technical assumptions in this app are:

1. **Crossfading two YouTube IFrame players well** (see "Playback")
2. **Live sync across devices with no page refresh** (see "Real-time updates") — a song added or voted on from one phone shows up on everyone else's screen instantly

Everything else (trim points, session-token permissions, host controls, accessibility polish, etc.) is comparatively straightforward Rails CRUD work. **Build and validate these two first**, even with the rest of the app barely scaffolded — a minimal playlist model, hardcoded/seeded songs, and no permission checks are fine at this stage if that's what it takes to get a working spike of crossfade + live sync. Once both feel solid, layer the remaining features in incrementally, one at a time (see "Git & pull request workflow" below for how each feature should land).

Don't build out the full feature set breadth-first before these two are proven — if either turns out to be harder than expected (e.g. autoplay restrictions blocking the standby player, or Turbo Streams broadcast timing issues), it's better to discover that early while the rest of the app is still small.

For a rough, ordered PR-by-PR plan built on this principle, see `docs/roadmap.md` (a suggested path, not a contract).

## Project summary

Rails app for collaborative, real-time party playlists. A creator starts a playlist and shares a link; friends suggest YouTube songs and vote, no account needed in the PoC. The creator's browser is remembered via a session token, so host-only actions (reorder, remove, playback, trim override) stay gated without requiring login.

Full feature scope: see `README.md`. Rationale for key choices: see `docs/decisions.md`.

## Accessibility

Hard requirement, not a polish pass: fully usable via **keyboard alone** and with a **screen reader**. Semantic HTML first, ARIA only where HTML genuinely can't express the interaction. Full guidance (ARIA usage, focus handling, keyboard-flow testing) lives in the `accessibility` skill (`.claude/skills/accessibility/SKILL.md`) — check semantic HTML and keyboard/focus behavior as part of building any interactive feature, not as a follow-up task.

## Domain model

```
Playlist
  has_many :songs, dependent: :destroy
  # slug: public, unguessable identifier used in the shareable URL
  # (No status/finalize concept: playlists are always open — playback
  # can start anytime and suggestions/votes stay open during the
  # party. See docs/decisions.md.)
  # crossfade_seconds: integer, default 3, 0 = hard cut instead of a fade
  # creator_token: random string generated when the playlist is created,
  # stored in the creating browser's session so that browser is
  # recognized as the creator on later visits. No accounts in the PoC —
  # see Permission model and docs/decisions.md.

Song
  belongs_to :playlist
  belongs_to :transition_sound, optional: true
  has_many :votes, dependent: :destroy
  # youtube_video_id, position
  # suggester_token: random string identifying the browser that
  # suggested this song (from session), so that browser can edit trim
  # points later. Nullable is not expected in practice, but the column
  # itself isn't a foreign key to any user table — there is none.
  # start_seconds, end_seconds: trim points for playback (nullable —
  # nil means play the full video). Editable by the browser matching
  # suggester_token, or by the playlist creator; see Permission model.
  # start_has_clear_beat, end_has_clear_beat: boolean, default true.
  # Whether the audio right at start_seconds/
  # end_seconds has a defined rhythmic beat or not — drives whether
  # the crossfade into/out of this song is forced to a hard cut. See
  # "Playback" and docs/decisions.md.
  # transition_sound_id: optional — a sound effect (e.g. swoosh, horn)
  # to play during the crossfade into this song. nil (and
  # transition_sound_disabled is false) means the app auto-selects one
  # at playback time based on beat classification; set explicitly to
  # override the auto-pick. Same ownership as trim points.
  # transition_sound_disabled: boolean, default false. When true, no
  # sound plays for this transition at all — explicit opt-out,
  # distinct from nil (which means "let the app choose"). Same
  # ownership as trim points.
  # skip_start_seconds, skip_end_seconds: nullable pair — an internal
  # segment to skip during playback (e.g. non-music video footage in
  # the middle of a music video). Both set together or neither. v1
  # supports one segment per song; see docs/decisions.md for why a
  # separate has-many model is deferred until multiple segments are
  # actually needed. Same ownership as trim points.
  # title/thumbnail_url: not stored in the PoC (no YouTube API call yet);
  # add once search replaces URL/ID pasting, see docs/decisions.md

TransitionSound
  has_many :songs
  # name, audio_file_path
  # climax_offset_seconds: how far into the clip its loudest/climactic
  # moment falls (e.g. 3.0 for a 3-second swoosh buildup before the
  # hit). Used to schedule playback so the climax lands on the
  # crossfade's swap moment, not the clip's start. See "Playback".
  # A small built-in library shipped with the app (seeded), not
  # user-uploaded in the PoC — see docs/decisions.md

PartyMessage
  belongs_to :playlist
  # body: short text (enforce a max length, e.g. ~200 chars — it has
  # to fit legibly on the playback screen)
  # sender_token: random string identifying the sending browser (from
  # session) — same pattern as suggester_token/voter_token. Lets the
  # sender delete their own message and gives the creator a handle for
  # per-sender moderation later if needed.
  # displayed_at: nullable timestamp — set when the playback screen has
  # shown it, so re-opening/reloading the playback screen doesn't
  # replay old messages. Text-only in v1 — image/audio deferred, see
  # docs/decisions.md.

Vote
  belongs_to :song
  # voter_token: random string identifying the voting browser (from
  # session). Unique index on [song_id, voter_token] — one vote per
  # browser per song. This is the PoC's only spam/duplicate-vote
  # safeguard; it resets if someone clears cookies.
```

No `User` model, no Devise, no login/registration flow in the PoC — see "Permission model" below and `docs/decisions.md` for why.

## Permission model

**No accounts in the PoC.** Identity is entirely session-based: a random token is generated and stored in the browser's session the first time it matters (creating a playlist, suggesting a song, voting), and compared against the token stored on the record to decide what that browser is allowed to do. No password, no email, no login form.

- **Any visitor** — can view a playlist via its slug, suggest songs, and vote (one vote per song per browser session, enforced via `voter_token`), and send short party messages to the playback screen.
- **A message's sender** (browser's session token matches `party_message.sender_token`) — can delete their own message.
- **A song's suggester** (browser's session token matches `song.suggester_token`) — can set that song's start/end trim points, their beat classification (clear beat / no beat), its transition sound (pick a specific one, leave it unset so the app auto-selects, or explicitly disable it entirely), and its internal skip segment.
- **Creator** (browser's session token matches `playlist.creator_token`) — can reorder and remove songs (also while playback is running), open/control the playback screen, set/override any of the above (trim points, beat classification, transition sound, skip segment) on *any* song in the playlist, and delete *any* party message.

This is intentionally simple and has a known weakness: clearing cookies or switching browsers loses creator/suggester status, and there's no recovery mechanism. That's an acceptable tradeoff for a proof of concept — see `docs/decisions.md` for the reasoning and what real accounts would add back.

When adding a new controller action, guard it with a check against the relevant session token (e.g. `session[:creator_token] == playlist.creator_token` for host-only actions, `session[:suggester_token] == song.suggester_token || ...` for trim-point actions) rather than reaching for a policy gem — the logic is simple enough not to need one yet.

## Real-time updates

Live updates use **Turbo Streams over Action Cable**, not a custom WebSocket layer or JS framework. The Action Cable backend is **Solid Cable** (Rails 8's database-backed adapter) — no Redis needed, which keeps the infrastructure to just Rails + MySQL. Solid Cable is polling-based (default ~100ms), which is imperceptible for this app (a song appearing on the big screen ~100ms after it's added on a phone is fine); it would only matter for latency-critical realtime, which this isn't.

- Broadcast on `Song` create/destroy, `Vote` create/destroy, and `PartyMessage` create/destroy (messages ride the same playlist-scoped stream as everything else — no separate channel).
- Broadcasts target a stream scoped to the playlist (e.g. `turbo_stream_from playlist`).
- Reordering and removing should also broadcast, since the creator's actions must be visible to everyone watching the playlist live — including during playback, since the queue stays open while the party is running.
- **Broadcasts must never re-render the playback screen's player area.** A Turbo Stream update that replaces DOM containing the two `YT.Player` iframes would destroy both players mid-song. Keep the player container strictly outside every Turbo-updated region; queue lists, vote counts, and message overlays update around it.

Keep view logic in partials that can be reused by both the initial page render and the Turbo Stream broadcast (`render_to_string` from the model callback or a broadcast job, targeting the same partial the index/show view uses).

## External services

**None in the proof-of-concept.** Songs are added by pasting a YouTube URL or video ID directly — parse/validate the ID client- or server-side, no external API call needed. There's no UI-primitives library dependency either (e.g. no autocomplete/combobox widget) since there's no search input to enhance yet.

When YouTube Data API search replaces URL/ID pasting (see `docs/decisions.md`), route calls through a dedicated service object (e.g. `YoutubeSearchService`) rather than calling the API directly from controllers, and read the API key from `ENV["YOUTUBE_API_KEY"]`.

## Playback

**PoC scope: single device only** — the playlist creator plays from their own browser (playback screen is creator-only); other visitors' devices show queue/vote UI but don't play audio. There's no finalize step: playback can start anytime, the queue stays live during the party (suggest/vote/reorder), votes are advisory to the creator's manual ordering, and playback loops after the last song. Multi-device synced playback (every device independently playing while receiving the same commands, not audio streaming — see decision #10) is future scope.

Crossfade is done with two `YT.Player` instances, ramping both audio volume and CSS opacity together off one shared progress value, with an ad-related host-device requirement and a one-time test-playback check (no reliable in-app ad detection exists). The actual crossfade duration per transition depends on each song's beat classification (`start_has_clear_beat`/`end_has_clear_beat`) — two clear-beat boundaries force a hard cut to avoid overlapping rhythms. Songs can optionally have a `transition_sound` (a local stinger/riser audio clip, from a small built-in library) that plays during the crossfade into them — simpler than the YouTube crossfade itself since it's local audio, not an embedded iframe. If no sound is explicitly picked (and it isn't explicitly disabled), the app auto-selects one based on the beat classification/effective crossfade duration. A song can also have one internal skip segment (e.g. non-music-video footage mid-song), handled by the same two-player mechanism with a much shorter, fixed transition duration. In-flight transitions are safely cancellable (a manual skip-to-next mid-crossfade cleanly cancels and restarts rather than being blocked or corrupting state). Visitors can send short text party messages that appear briefly as an overlay on the playback screen. Full architecture, the step-by-step fade algorithm, transition sounds, skip segments, party messages, and all constraints live in the `playback-crossfade` skill (`.claude/skills/playback-crossfade/SKILL.md`).

## Git & pull request workflow

- **One feature per branch.** Each new feature (or fix) gets its own branch off the default branch — don't stack unrelated work into one branch/PR. This applies to the build-order milestones too: the crossfade spike and the live-sync spike should be separate branches/PRs, not one giant "core mechanics" branch.

**Before every PR is merged, check all of the following:**

- [ ] Any new or changed behavior has tests covering it (system specs for user-facing flows, unit specs where they add value — see "Testing"). Not tested-later-as-a-followup.
- [ ] The full test suite passes, not just the tests for this change.
- [ ] Code is linted/formatted cleanly: `bin/rubocop` (RuboCop with `rubocop-rails-omakase`, Rails 8 default — zero-config omakase style).
- [ ] The PR title and description accurately describe the current diff — update them as new commits are pushed if scope changes, and do a final check right before merge, since scope creep during review is easy to miss.
- [ ] Every doc or config file the PR makes stale is updated to match — not just `README.md` and `CLAUDE.md`. This includes `docs/decisions.md` (add an entry if the PR makes or changes a real decision), inline code comments describing behavior the PR changed, `.env.example` if env vars changed, migration/schema docs if the data model changed, and any other file whose accuracy the PR affects. The two constants (`README.md`, `CLAUDE.md`) are the minimum, not the whole list — ask "what else does this change make wrong?" rather than only checking those two by name.

A reviewer (human or AI) should be able to trust the PR description, and the state of the docs, without having to diff them against the actual changes to check they're accurate.

## Claude Code automation

**Skill routing — consult before editing, don't rely on memory.** Skills auto-load based on their descriptions, but as a deterministic backstop, this table (always in context via this file) maps work to the skill that governs it:

| When touching… | Consult |
|---|---|
| Any view/template/partial, any interactive UI element | `accessibility` |
| Any spec file, test setup, or coverage decision | `testing-conventions` |
| Playback, players, crossfade, transitions, skip segments, party-message overlay, `player_controller.js` | `playback-crossfade` |
| `docs/decisions.md` | `decision-log` |

A path-based reminder hook (`.claude/hooks/skill_reminder.sh`) also emits these pointers automatically on matching edits — belt and suspenders.

**Skills already scaffolded** (`.claude/skills/`), pulled out of this file to keep it lean since `CLAUDE.md` loads into every session regardless of task, while skills load only when relevant:
- `playback-crossfade` — the full crossfade architecture (see "Playback" above for the summary)
- `testing-conventions` — full RSpec/Cuprite/file-organization detail, including automated axe-core accessibility checks (see "Testing" above for the summary)
- `accessibility` — full ARIA/focus/keyboard guidance (see "Accessibility" above for the summary)
- `decision-log` — conventions for adding/superseding entries in `docs/decisions.md`

**Slash commands** (`.claude/commands/`):
- `/add-decision <topic>` — append a correctly-numbered decision entry
- `/pre-merge-check` — walk the pre-merge checklist against the current branch and report pass/fail per item

**Hooks** (`.claude/hooks/`):
- `check_html_safe.sh` — blocks edits introducing `html_safe`/`raw()` in app code (enforces the Conventions rule deterministically).
- `skill_reminder.sh` — path-based, non-blocking: every edit to a governed path (views, specs, playback code, the decision log) gets the matching skill pointer injected, making skill routing deterministic rather than memory-dependent. Both scripts are wired into `.claude/settings.json`.

**Still planned** (scaffolding done; these are the next automation layer — see `docs/decisions.md` #15, #35):

- **Hook** (deterministic, always fires — this is the real "validation loop"): a `PostToolUse` hook that runs `bin/rubocop` after file edits, and a `Stop` hook that runs `bin/rspec` before a task is considered done. This turns "tests pass, code is linted" from something that has to be remembered into something enforced automatically, every time, no exceptions.
- **Subagent** (isolated context, spawned for a side task, only a summary returns): a test-runner/reviewer subagent that runs the full suite plus a CLAUDE.md-conventions check and reports pass/fail — keeps verbose test/lint output out of the main working context during a feature.

Quick distinction, since it's easy to mix these up: hooks are deterministic (always run, no judgment call); skills and subagents are both judgment-based (Claude decides when to use them), but skills run in-line in the same context while subagents run isolated and report back a summary.

## Conventions

- Standard Rails conventions (fat models where reasonable, skinny controllers, service objects for external API calls).
- Use Hotwire idioms (Turbo Frames/Streams, Stimulus controllers) over reaching for a JS framework — this is a deliberate stack choice, see `docs/decisions.md`.
- No CSS framework for v1 — views use plain HTML with minimal/no styling. Don't add Tailwind or similar without an explicit decision to do so (see `docs/decisions.md`).
- Identity: session-token based, no accounts — do not add Devise/login in the PoC without an explicit decision to do so (see decisions doc).
- Write model-level validations for anything enforced at the DB level too (e.g. the one-vote-per-user-per-song constraint should exist as both a DB unique index and a model validation).
- **Rate-limit unbounded anonymous writes.** Votes are naturally bounded (unique index per browser/song), but suggestions and party messages are not — without accounts, a prankster with the link could flood the queue or the playback screen. Apply simple per-session-token rate limits (e.g. a max per minute) to `Song` and `PartyMessage` creation.
- **Markdown: one line per paragraph, no hard-wrapping.** Write each
  paragraph, list item, and blockquote as a single unbroken line
  (soft-wrapped by the editor), not hard-wrapped at a fixed column.
  Blank lines separate paragraphs as normal. This renders correctly in
  every Markdown viewer, including break-happy ones that turn
  mid-paragraph newlines into visible `<br>`s — see decision #38.
- **Never mark user-provided text `html_safe`.** Party message bodies and any future user text render on a screen the whole party sees — rely on Rails' default escaping everywhere; emoji work fine without raw HTML.

## What's explicitly out of scope for the PoC

Don't build these unless a decision doc entry says otherwise:

- User accounts / login (Devise or Rails 8's built-in auth generator — to be decided when accounts are added; identity is session-token based for now, see "Permission model")
- YouTube search (URL/ID pasting only)
- A UI-primitives library (e.g. Zag.js) for widgets like autocomplete
- Playlist cloning/reuse
- Export to Spotify or a real YouTube playlist
- Event/date scheduling tied to a playlist
- Multi-device synced playback

## Testing

**Framework:** RSpec with Cuprite/Ferrum as the browser driver. System specs are the primary source of confidence, organized one file per feature area (extend an existing spec rather than creating a new one where possible — browser specs are the expensive part of the suite). Unit specs cover what system specs don't reach efficiently (models, requests, services). Screenshot testing is deferred until real CSS exists. Time-sensitive/JS-timer behavior (crossfade, transition sounds, live sync) is tested via extracted pure functions and injectable/fake clocks rather than waiting for real time to pass, with only a small number of tiny-duration real-browser specs as smoke tests. Full conventions, directory layout, and the reasoning live in the `testing-conventions` skill (`.claude/skills/testing-conventions/SKILL.md`).
