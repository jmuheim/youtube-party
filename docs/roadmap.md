# Implementation Roadmap

A rough, ordered path for building YouTube Party one PR at a time. This is a suggestion, not a contract — reorder or resize as you see fit. Each step is meant to be an independently mergeable PR that satisfies the pre-merge checklist in `CLAUDE.md` ("Git & pull request workflow"): tested, suite green, linted, accurate PR description, docs updated.

Guiding principles baked into the ordering:
- **Build order (decision #14):** the two riskiest things — crossfade and live cross-device sync — get proven first, on a deliberately minimal app, before the rest is layered on.
- **One feature per PR (decision #14).** Steps here map roughly to PRs; a few large ones note a suggested internal split.
- **Spikes before commitments.** The single biggest unknown (autoplay behaviour for the standby player, especially mobile Safari) is flushed out in Phase 0 before much is built on top of it.

Decision references (e.g. #10) point to `docs/decisions.md`.

---

## Phase 0 — Foundation & de-risking

The goal of this phase is not features; it's to prove the scary parts work and lay the minimum groundwork.

### PR 0.1 — Rails 8 app skeleton
- `rails new` with Rails 8 (#32), MySQL (#9), Hotwire, RSpec instead of Minitest.
- Add Cuprite/Ferrum for system specs (#8); confirm a trivial system spec boots a browser and passes.
- Add `axe-core-rspec` and confirm a `be_axe_clean` assertion runs in the trivial system spec (automated a11y checks — see the `testing-conventions` skill).
- Pin the linter/formatter (RuboCop or chosen alternative) and wire it up — this unblocks the pre-merge checklist and the future automation hook (#15).
- **CI**: GitHub Actions workflow running RSpec + the linter on every PR (the pre-merge checklist's "suite passes, linted" enforced server-side, not just locally). Add Dependabot for gem updates.
- Update `CLAUDE.md`: replace "to be pinned down during scaffolding" notes (linter, `bin/rspec` paths) with the real setup. Fill in the README "Getting Started" with real steps.
- **Wire up the prepared automation (#15, #35):** the lint/test hooks, plus the two hooks already written and logic-tested — `check_html_safe.sh` (blocking) and `skill_reminder.sh` (path-based skill routing, non-blocking) — added to `.claude/settings.json` per the comments in each script; and the test-runner/reviewer subagent. The `decision-log` skill, the `/add-decision` + `/pre-merge-check` commands, and the PR template (`.github/pull_request_template.md`) already exist and need no wiring.

### PR 0.2 — Crossfade spike (the big one, de-risk first)
- Minimal: a hardcoded/seeded list of 2–3 known-playable video IDs, no real models beyond what's needed, no permissions, no styling.
- Two stacked `YT.Player` instances; get the audio-volume + opacity crossfade working off one shared progress value (see the `playback-crossfade` skill).
- **Explicitly test the autoplay assumption on real devices, including mobile Safari (#10)** — this is the riskiest unknown in the whole project. If the standby player can't be started programmatically after the first user gesture, the whole playback design needs rethinking, and it's far cheaper to learn that now.
- Structure the scheduling math as pure functions with an injectable clock from the start (#24) — don't retrofit this.
- Tests: pure-function unit specs for the fade math; one tiny-duration smoke system spec.

### PR 0.3 — Live-sync spike (the other big one)
- Confirm Turbo Streams over Solid Cable (#5, #32) broadcasts across two browser sessions with no page refresh — the "song appears on the other device instantly" proof.
- Still minimal models; this is about proving the transport and the broadcast/partial-rendering pattern, including the rule that broadcasts never touch the player DOM (#31).
- Tests: a system spec using two Capybara sessions asserting a change in one appears in the other (auto-waiting matchers, no sleeps — #24).

> Gate: don't proceed past Phase 0 until 0.2 and 0.3 both feel solid. Everything after this is comparatively ordinary Rails work.

---

## Phase 1 — Core domain & collaborative loop

Now build the real app around the proven mechanics.

### PR 1.1 — Playlist + Song models, creation, shareable link
- `Playlist` (slug, `crossfade_seconds`, `creator_token`) and `Song` (`youtube_video_id`, `position`, `suggester_token`) — just these columns for now; other Song attributes come with their features.
- Create-a-playlist flow, shareable-slug URL, public read-only view.
- Session-token identity groundwork (#13): generate/store the creator token; the "am I the creator" check.

### PR 1.2 — Suggest songs via URL/ID
- Paste-a-URL-or-ID parsing/validation as a service object (#4), unit tested including malformed input.
- Suggesting appends to the queue; broadcasts live (#5).
- Rate-limit suggestions per session token (#31).

### PR 1.3 — Voting
- `Vote` model, `voter_token`, unique index + model validation (one vote per browser per song).
- Vote/un-vote, live count updates, votes shown but advisory only (#29).

### PR 1.4 — Creator controls: reorder & remove
- Manual reordering (sets `position`), remove songs, both broadcast.
- Creator-only guards via `creator_token` (#13).

> At this point the pre-party collaborative experience is complete: people can gather, suggest, and vote on a shared link.

---

## Phase 2 — Playback for real

Fold the Phase 0 crossfade spike into the real models and make it a usable playback screen.

### PR 2.1 — Playback screen wired to real playlist
- Creator-only playback screen (#30) driving the real queue in `position` order.
- Looping after the last song (#30); first song starts without a fade-in.
- Queue-changes-during-playback handling: re-cue standby on reorder/removal; removing the playing song = skip-to-next (#30).

### PR 2.2 — Robustness: unavailable videos, wake lock, test-playback
- `onError` handling → mark unplayable, auto-skip (#31).
- Screen Wake Lock + keep-tab-focused notice (#31).
- Pre-party "check all songs" pass and the ad test-playback check (#18, #31) — the test-playback tap also doubles as iOS Safari's one-time media priming (#41).

### PR 2.3 — Transition cancellation architecture
- Playback state (`idle`/`playing`/`transitioning`) + cancellation-token pattern so skip-to-next mid-transition is safe (#26).
- Disabled-with-descriptive-label skip control (#26), no `aria-live` audio on the playback device.
- This also resolves the standby-slot contention noted for later features.

> Reasonable "usable at a real party" milestone ends here: curate on a shared link, then play with crossfades from one device.

---

## Phase 3 — Playback refinements

Each of these is independent and optional — build in whatever order the appeal/effort tradeoff suggests.

### PR 3.1 — Trim points (start/end)
- `start_seconds`/`end_seconds`, suggester/creator ownership, validation (#11). Feeds the crossfade trigger.

### PR 3.2 — Beat classification → beat-aware crossfade
- `start_has_clear_beat`/`end_has_clear_beat`; clear-beat boundaries force a hard cut, reusing the existing hard-cut path (#22).

### PR 3.3 — Transition sounds: library + manual pick
- `TransitionSound` model + seeded built-in library, `climax_offset_seconds` climax-aligned scheduling (#20, #21). Manual pick / disable per song.
- Local-audio playback concurrent with the iframes.

### PR 3.4 — Transition sound auto-selection
- Auto-pick from beat classification / effective crossfade duration when not explicitly set (#23). Builds directly on 3.2 + 3.3.

### PR 3.5 — In-song skip segments
- `skip_start_seconds`/`skip_end_seconds` (one segment, two columns), same two-player mechanism, short fixed duration (#25). Depends on the cancellation architecture (2.3) being in place.

---

## Phase 4 — Social touches

### PR 4.1 — Party messages
- `PartyMessage` (text-only), send from phone, auto-display overlay on the playback screen, sender/creator delete, rate-limited, never `html_safe` (#28, #31). Rides the existing broadcast channel.

---

## Deliberately later (not yet scheduled)

Pulled from the README roadmap / decisions — each a future epic, likely several PRs of its own, and some gated on prerequisites:

- **YouTube search** (YouTube Data API v3) replacing URL/ID paste (#4) — brings back the `YoutubeSearchService`, an API key, and possibly the UI-primitives library question (Zag.js).
- **Real accounts** (email + login) — Rails 8 built-in auth vs. Devise to be decided (#3, #32); would fix the cookie-loss identity weakness (#13).
- **Remote admin playback control from phones** — reorder/jump/insert from a phone, multiple admins, resume-vs-continue semantics (#17). Note: visitor participation *during* playback already lands in Phase 1–2 (#30); this is the admin-remote-control half.
- **Multi-device synced playback** — every device runs its own player in step via broadcast commands, not audio streaming (#10). Shares the "broadcast playback state" infrastructure with remote admin control. Note: this is a clock-sync design (scheduled targets + synchronized clock, per decision #5), not a faster-transport problem — don't reach for Redis/AnyCable expecting it to solve device sync.
- **Media party messages** (image/audio) — gated on accounts and/or a moderation flow (#28).
- **CSS / visual design pass** — plus screenshot tests (`capybara-screenshot-diff`) once there's design to regress (#6, #8).
- **Transition-sound refinements** — ducking, user-uploaded sounds, smarter auto-selection (#20, #23).
- **Multiple skip segments** (has-many `SkipSegment` model) and a configurable skip-transition duration (#25).
- **Local song downloads via yt-dlp** (private/self-hosted use only) — download audio/video server-side so playback owns the media file instead of embedding YouTube's player. Would eliminate ads, give real Web Audio API mixing (true sample-accurate crossfades instead of `setVolume()` on two iframes), sidestep embed/region restrictions, and make multi-device sync far simpler. **But it squarely conflicts with YouTube's ToS and raises copyright questions** — a deliberate reversal of the project's work-within-YouTube's-rules stance, so it's gated to private/self-hosted deployments, not the public app. Also a real server-side lift (download/transcode/storage + a background job pipeline — this is where Solid Queue would finally earn its place). See decision #33.
- **Beat mixing** (#34) — real beatmatching is impossible in the iframe (no audio access; same root cause as the `setVolume()` crossfade workaround) and is a downstream feature of the yt-dlp owned-file path above. A limited *manual* phrase-aligned crossfade (hand-entered BPM, aligning the swap to a beat boundary) is possible in the iframe but niche/power-user, not near-term.

### Party-experience ideas (brainstormed, unscheduled — decision #37)

Cheap and very party:
- **QR code on the playback screen** — the join link as a small corner overlay; anyone walking in points their camera and is in. Tiny feature, kills the "how do I share the link mid-party" friction entirely.
- **Emoji reactions** — tap 🔥/❤️/🕺 on a phone, it floats over the big screen live. Rides the existing Turbo Streams channel, ephemeral (no storage), same never-obscure-the-player overlay rules as party messages.
- **Dedications** — a note attached to a *suggestion* ("for the birthday girl 🎂") that displays when that song starts playing. Combines songs + message overlays, both already built.
- **Optional nicknames** — a display name on the session token; unlocks "suggested by Anna", signed messages, and vote transparency with one small field.

Useful for guests:
- **Now-playing page on phones** — answers "what's this song?" from queue state every device already syncs; includes tonight's history.
- **Post-party recap** — a shareable page after the event: full setlist, top-voted songs, the message wall. Mostly a read-only view over stored data.

For the DJ:
- **Energy-curve view** — with vibe/energy tags (or the manual BPM metadata from #34), visualize the queue's energy arc; purely advisory, consistent with #29.
- **DJ handoff** — transfer the creator role to another device via a short code; practical (reorder from a phone while the laptop plays) and incidentally softens #13's cookie-loss weakness.
- **Beat-pulsed visuals** — manual BPM metadata is enough to pulse a border/glow on the beat with pure CSS timing; no audio access needed. Respect `prefers-reduced-motion`.

With a design tension (explicit opt-in only):
- **Audience-choice mode** — the room votes live on which of the top N songs plays next. Fun, but directly conflicts with #29 (votes advisory); would be a deliberate, per-playlist opt-in reversal and should get its own decision entry if pursued.

Housekeeping surfaced by the same brainstorm:
- **Duplicate suggestions** (same video suggested twice in one playlist) — flagged in the design review, still unresolved: reject vs. merge votes. Settle when building PR 1.2/1.3.

---

## How to read this vs. reality

- **Phases 0–2 are the recommended spine**; the ordering there matters (mechanics → domain → playback). Within Phase 3 the order is mostly free, though there are noted dependencies (3.4 needs 3.2+3.3; 3.5 needs 2.3).
- Sizes vary — 0.2 and 0.3 are genuine spikes that may each take real time; several Phase 3 PRs are small. Split any PR that grows past "one reviewable change".
- Keep `docs/decisions.md` as the source of truth for *why*; this file is just *order*. If implementation reveals a better path, update this file (it's covered by the same "keep docs current" checklist).
