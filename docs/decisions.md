# Decisions

Lightweight decision log for choices made during planning. Add a new entry whenever a meaningful architectural or scope decision is made or revisited — doesn't need to be exhaustive, just enough for future-you (or an AI assistant) to understand *why* something is the way it is.

---

### 1. No guest participation in v1

> **Superseded by #13.** The PoC went further than this — not just allowing guests, but removing accounts entirely for now. Kept here for history; see #13 for current behavior.

**Decision:** All participation (suggesting songs, voting) requires a registered, confirmed account. There is no anonymous/guest mode in v1.

**Why:** A guest-identity system (session-scoped nicknames, dedup, spam prevention) adds real complexity for a first iteration. Requiring registration is simpler to build and reason about, and still allows anyone to *view* a playlist without an account.

**Revisit if:** friction from requiring signup turns out to suppress participation in practice. Guest mode is on the v2 roadmap.

---

### 2. Public read access via shareable link

> **Note:** as of #13, suggesting and voting no longer require an account either — this decision's core point (anyone with the link can view) still stands and now extends further.

**Decision:** Anyone with a playlist's link can view it without logging in. Only suggesting and voting require an account.

**Why:** Viewing is the lowest-friction way for someone to decide whether they want to bother registering, and it lets the playlist double as a "here's what we're playing" page during the actual event.

---

### 3. Authentication via Devise with `:confirmable`

> **Superseded by #13.** The PoC has no accounts at all, so Devise isn't in the stack for now. Kept here for history — this is the design to return to when real accounts are added back.

**Decision:** Use Devise for auth, with email + activation link required (`:confirmable` module enabled) rather than instant signup.

**Why:** Email confirmation is a cheap way to cut down on throwaway/spam accounts given there's no guest tier to absorb casual participation. Devise is the default, well-understood choice for Rails auth — no need to reach for a custom solution or an external auth provider for this scope.

> **Reconsider Devise when accounts are actually added (see #32):** Rails 8 ships a built-in authentication generator (session-based, password-resettable, metadata-tracking) that may cover this app's needs without Devise. When the time comes to add real accounts, evaluate the built-in generator first — Devise is still fine, but may no longer be necessary. Email confirmation would need to be added on top of the generator (it doesn't include it out of the box).

---

### 4. Proof of concept first: add songs via YouTube URL/ID, not search

**Decision:** For the initial proof of concept, songs are added by pasting a YouTube URL or video ID directly. No YouTube Data API integration, no search-by-title, and no UI-primitives library (e.g. Zag.js) for an autocomplete/combobox widget — none of that is needed yet.

**Why:** The goal of the PoC is to validate the core loop (create a playlist, add songs, vote, see live updates, host finalizes) with the least moving parts. Search is a nicer experience but adds an API dependency, quota handling, and a non-trivial accessible UI component — all avoidable complexity for a first pass. Direct URL/ID pasting is enough to prove the concept end-to-end.

**Revisit:** once the core loop is validated, revisit song search via the YouTube Data API v3 (better UX for people who don't have a URL handy) and the UI-primitives-library question (Zag.js was the front-runner discussed, for its Combobox and other accessible headless components like Tabs, Dialog, Menu, should this or later features need them). Watch for YouTube Data API v3's daily quota if/when search is added; consider caching recent search results.

---

### 5. Real-time updates via Turbo Streams

**Decision:** Live updates (new songs, votes, reordering) are pushed via Turbo Streams/ActionCable, not a separate frontend framework or polling.

**Why:** Rails + Hotwire is the stack of choice for this project, and Turbo Streams gives real-time updates without introducing a separate JS/API layer. Keeps the whole app in one Rails codebase.

**Backend (added with the Rails 8 decision, #32): Solid Cable, chosen deliberately over Redis Action Cable and AnyCable — not a compromise.** The three adapters rank by raw speed as AnyCable (offloads WebSockets to a separate Go server; fastest, lowest memory) > Redis Action Cable (true pub/sub push) > Solid Cable (database polling; slowest of the three but simplest — just the app's own DB, no extra services). Solid Cable is chosen because:

- **v1's sync need isn't latency-sensitive.** The live updates that exist in v1 — a song/vote/message appearing on other devices — are fine at Solid Cable's default ~100ms polling; nobody notices whether a new song row appears in 100ms or 20ms. AnyCable/Redis would be solving a problem this app doesn't have, at the cost of running one or two extra services (Go server and/or Redis) — directly against the "keep infrastructure at Rails + MySQL" goal.
- **It's tunable if ever needed:** Solid Cable's own benchmarks show ~140ms median round-trip at the default 0.1s interval, dropping to Redis-comparable (~56–69ms median) at a 0.01s interval, at the cost of more DB read load.

**Clock-sync note for the future multi-device playback feature (#10) — important, so it isn't mis-framed later:** multi-device *synchronized playback* (every device playing the same song at the same position) must NOT be treated as a transport-latency problem. No WebSocket adapter — not even AnyCable — makes audio start "simultaneously" across devices by broadcasting a "play now" command faster, because network latency *and its variance* (Solid Cable's benchmarked max spiked to 5+ seconds under load) make "now" arrive at different real times on different devices. The correct design is application-layer: broadcast a *scheduled target* ("play song X from position Y as of timestamp T") plus a synchronized clock, and let each device compute its own local start offset — the approach NTP and networked audio systems use. This works fine over Solid Cable's latency precisely because the message conveys *when* to start, not *start now*. So the adapter choice does not constrain the future multi-device feature, and switching adapters would not help it.

**Caveat / revisit trigger:** Solid Cable adds DB read load (every connected client polls). At friends-at-a-party scale this is negligible; if a single party ever meant hundreds of simultaneous connections, revisit AnyCable. Nowhere near that for the intended use.

---

### 6. Plain HTML/CSS for v1, no CSS framework yet

**Decision:** No Tailwind (or other CSS framework) for now. Views use plain HTML with minimal or no styling. Visual design is deferred to a later pass.

**Why:** Styling isn't the bottleneck right now — the goal is to get the core flows (playlist creation, search, suggest, vote, live updates) working first. Adding a CSS framework later is low-cost; ripping one out or fighting its conventions while the core app is still taking shape is not worth it.

**Revisit:** once core flows work end-to-end, pick a styling approach (Tailwind was the earlier front-runner, but plain CSS or another framework are open again too) and add it deliberately rather than by default.

---

### 7. Accessibility: semantic HTML first, ARIA only as a fallback

**Decision:** The app must be fully usable via keyboard alone and with a screen reader. Semantic HTML (real buttons, links, labels, headings, landmarks, lists) is the default approach; ARIA attributes like `aria-label` are avoided in favor of correct markup, and are used only where HTML has no native equivalent — e.g. `aria-live` regions for announcing real-time updates (new songs, vote changes) delivered via Turbo Streams.

**Why:** Semantic HTML gets accessibility semantics, keyboard interaction, and screen reader support largely for free and stays correct as the app changes. ARIA is easy to get wrong (mismatched state, missing keyboard handling) and should be a deliberate, minimal addition rather than a first resort.

**Implication:** this affects real-time UI (live regions for Turbo Stream updates) and focus management (focus must be handled deliberately around dynamic content changes, not left to chance) — see the "Accessibility" section in `CLAUDE.md` for specifics. This should be treated as a constraint on every feature, not a separate accessibility pass at the end.

---

### 8. Testing strategy: RSpec + Cuprite, system-spec-first, one file per feature

**Decision:** Use RSpec across the board, with Cuprite (backed by Ferrum) as the Capybara driver for browser/system specs — not Selenium. System specs are the primary source of confidence and should cover every happy path plus most meaningful edge cases. To keep suite runtime reasonable, related scenarios are combined within a system spec (via nested contexts) rather than one spec per scenario, and system specs are organized one file per feature area (e.g. `voting_spec.rb`, `crossfade_playback_spec.rb`) rather than one giant spec or a file per tiny scenario — extend an existing feature's spec file when adding a related scenario, start a new file only for a genuinely different feature area. Models, requests, and services are still covered with focused unit tests. Screenshot/visual regression tests are deferred until real CSS exists; `capybara-screenshot-diff` is the leading candidate for when that happens, not yet finalized.

**Why:** Browser tests catch real integration issues (JS, Turbo Streams, accessibility/keyboard flows) that unit tests can't, so they're weighted as the primary safety net here rather than an afterthought. Cuprite/Ferrum talks to Chrome directly via CDP — no chromedriver version management, and it tends to be faster and less flaky than Selenium for Hotwire-heavy apps, which matters a lot given the crossfade and live-sync features are JS-timing-sensitive. System specs are the slow part of the suite, so combining scenarios and organizing by feature file (rather than one-file-per-scenario) keeps the suite fast without losing coverage. Unit tests remain for things system specs test inefficiently — validation edge cases, permission logic, external API error handling.

**Implication:** when adding a feature, default to extending the matching feature's system spec file (if one exists) rather than creating a new one, and reserve fine-grained assertions for unit-level specs. See the "Testing" section in `CLAUDE.md` for full conventions.

---

### 9. MySQL over PostgreSQL

**Decision:** Use MySQL as the database, not PostgreSQL.

**Why:** Personal preference/familiarity. Nothing in the current domain model or feature set (simple relational data, no need for Postgres-specific features like advanced JSON querying or full-text search) depends on Postgres, so MySQL is a fine fit.

**Watch for:** the one-vote-per-user-per-song uniqueness constraint and any future features should be double-checked against MySQL's behavior specifically (e.g. index/constraint syntax, case-sensitivity defaults) rather than assumed from Postgres conventions.

---

### 10. Playback: single-device crossfade via two YT.Player volume ramps

**Decision:** For the PoC, only the playlist creator's device plays audio (e.g. laptop into speakers) — other visitors' devices show the queue/vote UI but don't output sound. Crossfading between tracks is done client-side with two `YT.Player` instances: a standby player is preloaded with the next track, and the transition is a timed `setVolume()` ramp down on the outgoing player and up on the incoming one, over a creator-configurable duration (`crossfade_seconds`, default a few seconds, 0 = hard cut).

**Why:** The YouTube IFrame API doesn't expose raw audio (cross-origin iframe, no Web Audio API access), so volume-ramping two player instances is the only available crossfade mechanism — there's no way to do a true sample-mixed crossfade with YouTube-hosted audio. Restricting the PoC to single-device playback avoids a much harder problem (keeping independently-playing devices synchronized over the network) that isn't needed to validate the core idea.

**Watch for:** YouTube's terms require the player element to stay visible (no hiding it), and autoplay policies mean the programmatic `playVideo()` call on the standby player during a fade needs real-device testing (especially mobile Safari) before relying on it.

**Revisit:** multi-device synced playback is desired eventually (see README roadmap) — not one device streaming audio to others, but every device independently playing its own YouTube video/audio locally while receiving the same playback commands (which song, position, crossfade timing) over the network, so they stay in step. That's a distinct design problem — command sync and clock/latency handling across devices — not an extension of this single-device crossfade design, though it would reuse the same crossfade mechanics locally on each device. **This is a clock-sync problem, not a transport-latency problem** — see decision #5's clock-sync note: the solution is to broadcast a scheduled target ("play song X from position Y as of timestamp T") plus a synchronized clock and let each device compute its own offset, which works over any adapter including Solid Cable. Faster WebSocket transport (Redis/AnyCable) does not solve device sync and isn't needed for it.

**Why relaying/streaming audio to other devices was never actually an option** (worth stating explicitly, since it shapes the whole multi-device design): it's blocked both technically and by policy. Technically, the YouTube IFrame player is a cross-origin iframe — page JavaScript has no access to its decoded audio (no Web Audio API access, same limitation that already rules out true sample-mixed crossfading here). Capturing tab audio via something like `getDisplayMedia` is technically possible but requires explicit per-session user permission, not something that could run invisibly. Separately, even a technical workaround would violate YouTube's embed terms, which permit displaying the player as-is but not rebroadcasting/redistributing its audio or video to other devices. So "one device plays, relays to others" isn't a design option that was simplified away — it was never available, and that's exactly why the multi-device roadmap item above is specified as synced independent players, not audio relay.

---

### 11. Song trim points, editable by suggester or creator

**Decision:** Each song has optional `start_seconds`/`end_seconds` trim points to skip long intros/outros during playback. The browser that suggested a song (identified via session token, see #13) can set its trim points; the playlist creator's browser can also set or override trim points on any song, not just their own suggestions.

**Why:** The suggester usually knows best which part of "their" song is the part people want to dance to, so giving them control keeps that decision close to the person with the context. Giving the creator override power keeps a single point of accountability for the final playback experience, consistent with their existing host role (reorder/finalize/remove).

**Implication:** this is ownership-based permission layered on top of the session-token identity model (#13), not a clean separate tier — see the "Permission model" section in `CLAUDE.md`. It also directly affects playback: the crossfade trigger point is based on `end_seconds` (if set) rather than the raw video duration, and the standby player is cued to start at `start_seconds` — see "Playback" in `CLAUDE.md`.

---

### 12. Permission model: derived from session tokens, no roles table

**Decision:** Permissions are derived from whether the current browser's session token matches a token stored on the record (`creator_token` on `Playlist`, `suggester_token` on `Song`) — not from user accounts (there are none, see #13) and not from an explicit roles/permissions table.

**Why:** The permission model is simple enough (any visitor / song's suggester / creator) that a dedicated authorization gem or roles table would be over-engineering for a PoC. Revisit if roles multiply (e.g. co-hosts, moderators) or once real accounts replace session tokens.

---

### 13. PoC: no accounts, session-token identity instead

**Decision:** Drop accounts/authentication entirely for the proof of concept. Anyone with a playlist's link can view, suggest songs, and vote immediately — no registration, no login, no Devise. A lightweight "creator" concept is kept without accounts: when a playlist is created, a random `creator_token` is generated and stored in that browser's session, so the same browser is recognized as the creator on later visits and can reorder/finalize/remove songs. The same pattern (`suggester_token`, `voter_token`) identifies which browser suggested a given song (for trim-point permission, #11) and prevents duplicate votes from the same browser on the same song.

**Why:** Accounts add real setup cost (Devise, email delivery, confirmation flow) that isn't needed to validate the core idea — a group of friends suggesting and voting on songs together, with live updates and crossfade playback. Session tokens give just enough identity to keep host actions gated (so randos can't reorder someone else's party playlist) without asking anyone to sign up. This supersedes decisions
#1 and #3.

**Known weakness, accepted for now:** clearing cookies or switching browsers/devices loses creator or suggester status, with no recovery mechanism (no "forgot my playlist" flow). For a proof of concept used within a single browsing session before a party, this is an acceptable tradeoff.

**Revisit:** once the core loop is validated, real accounts (email + login, likely Devise with `:confirmable` as originally planned in #3) are the natural next step — they'd fix the cookie-loss weakness and let a creator manage playlists across devices and sessions. See the README roadmap.

---

### 14. Build order: validate crossfade + live sync before other features; one feature per PR, with a pre-merge checklist

**Decision:** Before building out the rest of the feature set, first prove the two riskiest technical assumptions work well: (1) crossfading two YouTube IFrame players, and (2) live sync across devices with no page refresh. It's fine for the rest of the app (permissions, trim points, host controls, etc.) to be minimal or missing while these two are validated. Once solid, remaining features are added incrementally, each in its own branch/PR. Before any PR merges: new/changed behavior must be tested, the full suite must pass, code must be linted/formatted, the PR title/description must accurately reflect the current diff, and every doc or config file the PR makes stale must be updated to match — `README.md` and `CLAUDE.md` at minimum, but also `docs/decisions.md`, `.env.example`, inline comments, and anything else whose accuracy the PR affects.

**Why:** Crossfade and live sync are the parts of this app that are genuinely uncertain (autoplay policy behavior, Turbo Streams timing) — everything else is well-trodden Rails CRUD. Proving the hard part works early avoids discovering a blocking technical issue after a lot of surrounding feature work is already built on top of it. The pre-merge checklist keeps the codebase reviewable and keeps `CLAUDE.md`/ `docs/decisions.md`/`README.md` trustworthy as the project grows past a single person's short-term memory of what changed — stale docs are worse than no docs, since they actively mislead.

**Implication:** see "Build order" and "Git & pull request workflow" in `CLAUDE.md` for the specifics. The exact linter/formatter (e.g. RuboCop) is still to be pinned down during scaffolding.

---

### 15. Claude Code automation: hooks, a skill, and a subagent — planned, deferred until after scaffolding

**Decision:** Automate parts of the pre-merge checklist (#14) using Claude Code's extensibility features once the app exists: a hook to run the linter and test suite automatically (deterministic — always fires), a skill encoding the system-spec scaffold/conventions (in-context, judgment-based), and a subagent to run the full test/lint pass in an isolated context so its output doesn't clutter the main conversation. Not created yet.

**Why:** These would reference real commands and paths (`bin/rspec`, a linter config file) that don't exist until the Rails app is scaffolded — writing them now means either faking paths or shipping config that's broken on arrival. Documenting the plan now means it's not forgotten, without committing to file layouts before there's a real app to automate.

**Revisit:** once `rails new` has run and a linter is chosen, scaffold the actual `.claude/` hook, skill, and subagent files described in the "Claude Code automation" section of `CLAUDE.md`.

---

### 16. Visual crossfade via synced opacity, not just audio

**Decision:** Both players' video stay visible during playback, stacked in the same position. The transition between songs is represented visually as a CSS `opacity` crossfade (outgoing player fades out, incoming fades in), driven by the same progress timer as the audio volume ramp — not a separate, independently-timed animation. If `prefers-reduced-motion` is set, skip the opacity ramp (jump straight to the end state) but keep the audio crossfade.

**Why:** YouTube's terms already require the player to stay visible, so showing the video was a given — but leaving the standby player's fade as audio-only would look jarring: a hard visual cut while the audio fades smoothly. Syncing opacity to the same progress value as the volume ramp keeps sound and picture changing together, which matters for a room of people watching as well as listening. Linear easing is fine for the opacity ramp (unlike audio, where linear volume causes a perceived-loudness dip) — that's a difference specific to how humans perceive sound vs. brightness/transparency.

**Implication:** see "Playback" in `CLAUDE.md` for the layout (stacked, same-size players) and the shared-progress-value implementation detail.

---

### 17. Future: live playback control from phones (not yet built)

**Decision (design capture, not scheduled work):** Once a playlist is actively playing, guests should keep being able to suggest and vote in real time (an extension of the existing suggest/vote flow into the "currently playing" state, not a new mechanism). Admins should additionally be able to, from their phone, reorder the remaining queue and jump to a specific song to play next — with a choice of what happens after that song finishes:
- **Insert-and-resume**: the jumped-to song plays as a one-off interruption, then playback resumes from wherever the original queue order was before the jump.
- **Jump-and-continue**: the jumped-to song becomes the new current position, and playback continues sequentially from there onward (equivalent to a reorder/skip-ahead).

This also implies **multiple admins**, not just a single creator — "admins" (plural) can act on the live playback, which is a step beyond the current single-creator model.

**Why documented now, not built now:** this is explicitly future scope per the person building this — captured here so the design intent (especially the resume-vs-continue distinction, which is easy to get wrong or oversimplify) isn't lost before it's picked up.

**Related to #10/multi-device synced playback, and likely sharing infrastructure:** #10's "Revisit" note clarifies that multi-device sync means every device independently plays its own YouTube video/audio while receiving the same playback commands — not audio streaming. That's the same broadcasting mechanism this feature needs (admin actions like reorder/jump need to reach every connected device as playback-state commands too). The two aren't identical — this decision is about *who can issue* playback commands and what commands exist (queue control), #10 is about *every device consuming* those commands to stay in sync locally — but they'd likely be built on the same underlying "broadcast playback state" mechanism rather than as two unrelated features.

**Implication for later design work:**
- Extends the permission model (`docs/decisions.md` #12, `CLAUDE.md` "Permission model") from a single `creator_token` to multiple admins — worth revisiting whether that's still a shared token, a list of tokens, or something else once this is designed. This is the "roles multiply" case #12 flagged as a reason to revisit.
- Extends "Playback" in `CLAUDE.md`: the crossfade/queue-advance logic currently assumes a fixed, sequential queue; jump-and-continue vs. insert-and-resume both need to be representable in whatever tracks "what plays next."
- The existing Turbo Streams live-sync infrastructure (decision #5) should extend naturally to broadcasting playback-state changes (what's playing, what's next) to every connected phone, not just queue/vote changes.

---

### 18. Ads are a host-device requirement, not an in-app feature

**Decision:** Ad-free playback (YouTube Premium or an ad-blocking browser/extension, e.g. uBlock Origin, Brave, AdBlock Plus) is an operational requirement on whichever device is driving playback — not something the app attempts to detect, block, or work around in code.

**Why:** YouTube embeds show ads by default unless the viewer has Premium, and the app has no legitimate way to suppress or skip them programmatically — doing so would violate YouTube's terms for the embedded player. Beyond the obvious UX problem (an ad playing over the "DJ mix"), an ad interrupting a track also throws off the `getCurrentTime()`/`getDuration()`-based crossfade trigger (decision
#10), since the timing logic assumes it's tracking actual song
playback. There's no clean in-app fix for either problem, so it's handled by requiring the host device to be ad-free at the browser/account level instead.

**Implication:** documented as a setup requirement in the README, and as a constraint in the "Playback" section of `CLAUDE.md`. Not a bug to fix later — there isn't a fix available within the constraints of using YouTube's embedded player.

**No reliable in-app ad detection either.** The IFrame Player API's `onStateChange` only exposes generic states (playing, paused, buffering, ended, etc.) — there's no distinct "ad" state, so an ad looks identical to real content at the API level. The undocumented heuristics people sometimes use (watching for `getVideoData().video_id` mismatches, or unexpectedly short `getDuration()` values) rely on YouTube-internal behavior that isn't part of the public API contract and can change without notice — not something to build reliance on.

**Chosen mitigation: a one-time host-side test-playback check, not continuous detection.** Rather than trying to detect ads live during the party (unreliable, as above), the playback screen should have the host play a short test clip and visually confirm no ad appeared before starting the real playlist. This is a deterministic human check rather than a fragile heuristic, costs a few seconds once per party, and avoids depending on undocumented API internals. It doesn't guarantee zero ads for the rest of the session, but combined with Premium/an ad-blocker it's a reasonable confidence check without over-engineering something the API doesn't actually support.

---

### 19. Split CLAUDE.md's deep-dive sections into skills

**Decision:** Moved the full detail of the Playback, Testing, and Accessibility sections out of `CLAUDE.md` and into three Claude Code skills (`.claude/skills/playback-crossfade/`, `.claude/skills/testing-conventions/`, `.claude/skills/accessibility/`). `CLAUDE.md` keeps short summaries of each with a pointer to the corresponding skill for full detail.

**Why:** `CLAUDE.md` loads into every session's context at start and stays for the whole session, regardless of what the task actually is — unlike skills, which only load when Claude judges them relevant to the current task. Before this split, `CLAUDE.md` had grown to ~460 lines, much of it deep technical detail (the full crossfade algorithm, the full ARIA/focus guidance, the full test-organization rules) that's only actually needed when working on that specific area. Paying that context cost on every single session — including ones that touch none of those areas — is wasteful. Splitting keeps the always-relevant core (build order, domain model, permission model, PR workflow) cheap to load while the deep-dive content is still one skill-invocation away when it's actually needed.

**Implication:** when adding substantial new detail to `CLAUDE.md` going forward, consider whether it's core/always-relevant (stays in `CLAUDE.md`) or deep-dive/situational (belongs in a skill, with just a short summary + pointer left in `CLAUDE.md`). `docs/decisions.md` is unaffected by this concern — it isn't auto-loaded into every session, so its length doesn't carry the same cost.

---

### 20. Optional per-song transition sound effects

**Decision:** A song can optionally have a `transition_sound` — a short local audio clip (stinger, e.g. an air horn, or riser, e.g. a swoosh) that plays during the crossfade into that song. Selection ownership mirrors trim points exactly: the song's suggester can pick it, the playlist creator can override it on any song. The sound library is a small built-in set shipped with the app (seeded `TransitionSound` records), not user-uploaded, for v1. No ducking of the underlying songs' volume while the effect plays, for v1 — it just layers on top.

**Why a library, not upload:** user-uploaded sounds are a fun idea but open a moderation question (inappropriate audio, copyrighted clips) that isn't worth taking on to prove out the core feature. A curated built-in library avoids that entirely for now.

**Why no ducking in v1:** ducking (temporarily lowering the songs' volume so the effect is clearly audible) is a nice-to-have polish, not required to validate whether transition sounds are fun in practice. Keeping v1 simple (effect just layers on top of the existing crossfade audio) avoids adding a third simultaneous volume-ramp concern (song A, song B, and now a temporary duck-and-restore) before the core two-way crossfade is proven solid.

**Why this is technically easier than the YouTube crossfade:** transition sounds are local audio files the app owns outright — no cross-origin iframe restriction, real `<audio>`/Web Audio API access, no YouTube ToS constraints. Playing a local `<audio>` element concurrently with the two `YT.Player` iframes is enough; the browser mixes multiple audio sources on its own without any manual audio-graph work required.

**Timing, by sound type:** a stinger (one-shot) plays once at the exact crossfade "swap" moment (the shared progress-value midpoint already used for the audio/visual ramp); a riser (sustained) starts at the same instant the crossfade begins and plays its natural length, not time-stretched or looped to fit `crossfade_seconds` — unnecessary complexity for a first version.

**Implication:** extends the `Song` model with a `transition_sound_id` (nullable) and adds a `TransitionSound` model; extends the permission model's "song's suggester" and "creator" bullets to cover this alongside trim points. Full mechanics live in the `playback-crossfade` skill (`.claude/skills/playback-crossfade/SKILL.md`).

---

### 21. Transition sounds scheduled by climax, not clip start

**Decision:** `TransitionSound` has a `climax_offset_seconds` field — how far into the clip its loudest/climactic moment falls. Playback is scheduled so that moment lands exactly on the crossfade's swap point (`T_swap - climax_offset_seconds` is when the clip starts playing), rather than simply starting the clip at the swap moment or at the start of the crossfade. This replaces the earlier stinger-vs-riser two-type design (decision #20) with one unified field that covers both cases: a percussive hit has `climax_offset_seconds` near 0, a swoosh with a buildup has a larger value.

**Why:** a sound effect with internal structure (buildup → climax → tail) needs its climax — the part that should feel synced to the actual song transition — aligned to the swap moment, not its clip start. The original design would have started a riser's *clip* at the crossfade start, which doesn't guarantee the *climax* lands anywhere meaningful relative to the actual transition. Scheduling by climax offset instead is a small, one-field generalization that handles both simple stingers and structured builds correctly, so a separate "type" enum isn't needed.

**Implication:** if `climax_offset_seconds` exceeds `crossfade_seconds`, the sound clip must start playing before the audio/visual crossfade ramp itself begins — the crossfade-trigger check needs to account for the longer of the two lead times. The clip's tail is allowed to continue playing after the crossfade completes and the new song is at full volume; that's a normal DJ-effect feel, not something to trim or fix. See the `playback-crossfade` skill (`.claude/skills/playback-crossfade/SKILL.md`) for the full scheduling logic.

---

### 22. Beat-aware crossfade duration: clear-beat boundaries force a hard cut

**Decision:** Each trim boundary (`start_seconds`/`end_seconds`) also gets a beat classification — `start_has_clear_beat`/`end_has_clear_beat` on `Song`, boolean, default `true`. Same ownership as trim points (suggester sets, creator can override). Per-transition, if the outgoing song's `end_has_clear_beat` and the incoming song's `start_has_clear_beat` are both `true`, the effective crossfade duration for that specific transition is forced to `0` (hard cut) regardless of the playlist's configured `crossfade_seconds` — reusing the existing hard-cut code path rather than inventing a new "short fade" mechanism. If either side is `false`, the playlist's configured `crossfade_seconds` is used unchanged (no cap) — this is the case where a longer overlap is fine.

*(Named `start_has_clear_beat`/`end_has_clear_beat` rather than the original `start_beat`/`end_beat` — the original names read like they stored a beat's timestamp/position, not a yes/no classification. Since there are only two states, a boolean with a `has_` prefix is both more precise and simpler than the originally-proposed enum.)*

**Why:** crossfading two songs that both have a defined beat right at the boundary means two different rhythms audibly overlapping — it sounds like a clash, not a mix. Forcing a hard cut in that specific case avoids it, while transitions where at least one side has no clear beat (e.g. an ambient intro/outro) can still use the normal configured crossfade with no downside. Defaulting to `true` is the safer assumption (most songs have a beat at their natural start/end); people setting trim points can mark it `false` when they know a boundary is genuinely ambient.

**Why reuse the hard-cut path instead of a new short-fade constant:** the app already has well-defined hard-cut behavior (`crossfade_seconds == 0`, decision #10). Reusing it for beat-clash transitions avoids introducing a second, separately-tuned "quick fade" duration with its own edge cases, for a case where an instant cut is actually the musically correct choice anyway, not just an approximation.

**Implication:** this must be computed per-transition (depends on the *pair* of adjacent songs), not once at playlist load — see the "Beat-aware crossfade duration" subsection of the `playback-crossfade` skill. It composes cleanly with transition sounds (decision #21): climax-offset scheduling is relative to the swap moment, not to `crossfade_seconds`, so a sound effect still plays correctly through a beat-forced hard cut with no special-casing required.

---

### 23. Auto-select transition sound from beat classification, with explicit override/disable

**Decision:** By default (`transition_sound_id` is `nil` and `transition_sound_disabled` is `false`), the app auto-selects a transition sound at playback time, using signal that already exists: the transition's beat classification and resulting effective crossfade duration (decision #22). A forced hard cut (both sides `has_clear_beat`) picks randomly from library sounds with a short `climax_offset_seconds`; a normal/longer crossfade picks randomly from sounds with a longer `climax_offset_seconds`. An explicit `transition_sound_id` always overrides auto-selection. `transition_sound_disabled: true` is a third state — explicitly no sound, distinct from "not decided" — and always wins over both.

**Why:** the person suggesting a song may not want to think about sound design, or may not understand the climax-offset/beat-classification concepts well enough to pick well — auto-selection means transition sounds are a nice-by-default feature rather than one that only works for people willing to configure it. The beat classification and effective crossfade duration were already being computed per-transition for decision #22, so this doesn't need new metadata — it's reusing existing signal for a second purpose.

**Why randomize within the bucket rather than always picking the "best" match:** this subsumes the "surprise me" idea floated earlier as a separate feature — auto mode already varies the sound each time rather than needing a dedicated randomize toggle. A deterministic best-match algorithm would feel repetitive across a whole party's worth of transitions; randomizing within a beat-appropriate bucket keeps some variety while still respecting the hard-cut-vs-longer-crossfade distinction.

**Implication:** computed fresh at playback time (same as effective crossfade duration itself), not persisted — since queue order can change before finalize, which pair of songs is actually adjacent isn't fixed until playback actually reaches that transition. See the "Transition sound effects" section of the `playback-crossfade` skill for the bucket thresholds (tunable, not a firm spec) and full logic.

---

### 24. Testing time-sensitive behavior via extracted pure functions and fake clocks, not real waits

**Decision:** For JS-timer-based behavior (the crossfade, transition sound scheduling, Turbo Streams live sync), avoid testing by waiting for real time to pass wherever possible:
- Extract scheduling math (fade-trigger condition, volume/opacity at a given progress, effective crossfade duration for a song pair) into pure functions, unit-tested with synthetic inputs — no timers, no waiting, and this is where the bulk of edge-case coverage should live since it's essentially free to run.
- The crossfade controller takes an injectable scheduler rather than calling `setInterval`/`requestAnimationFrame` directly, so tests can step time manually instead of waiting for it.
- `YT.Player` can be stubbed with a fake implementation returning test-controlled values, for specs that are really about scheduling logic rather than the real YouTube embed.
- The small number of real-browser specs that do exercise actual timers use tiny durations (e.g. a 5-second clip, 1-second crossfade), not realistic production values — they're smoke tests confirming the wiring works, not where exhaustive coverage belongs.
- No fixed `sleep` calls — Capybara's auto-waiting matchers instead.

**Why:** waiting for real time to pass in tests is slow (multiplies suite runtime by however long the behavior actually takes) and encourages a bad tradeoff — short waits are flaky, long "just in case" waits are slow, and neither gives good edge-case coverage. Separating "is the scheduling math correct" (pure functions, exhaustively tested, instant) from "does it actually work wired up in a real browser" (a handful of small smoke tests) gets thorough coverage without the suite becoming dominated by real-time waits.

**Implication:** this shapes how the crossfade/transition-sound/live-sync code itself gets structured, not just how it's tested — the scheduling logic needs to be extractable into pure functions and the timer needs to be injectable, which should be kept in mind while implementing those features, not bolted on after the fact. See the "Testing time-sensitive behavior" section of the `testing-conventions` skill for the full technique list.

---

### 25. In-song skip segments reuse the two-player crossfade mechanism

**Decision:** A song can optionally have one internal segment (`skip_start_seconds`/`skip_end_seconds`, nullable pair, both set together or neither) to skip during playback — e.g. non-music-video footage in the middle of a music video. Implemented by reusing the exact same two-`YT.Player` audio+visual crossfade mechanism as song-to-song transitions, just triggered mid-song and with both players loaded with the *same* `youtube_video_id` (one continuing to `skip_start_seconds`, the other cued to `skip_end_seconds`), over a short fixed duration (~1 second, not user-configurable in v1) rather than the playlist's `crossfade_seconds`. Same suggester/creator ownership as trim points, beat classification, and transition sound.

**Why reuse the existing mechanism:** the two-player volume+opacity crossfade already solves "smoothly hand off between two YouTube players playing different content at the right moment" — a skip segment is the same problem with the "different content" being a later timestamp of the same video instead of a different song. Building a separate mechanism would duplicate logic that already exists and is already being hardened (decision #24's testing approach applies equally here).

**Why a short fixed duration, not the playlist's `crossfade_seconds`:** skipping a boring stretch should read as a quick jump cut, not a multi-second blend — a full crossfade would make the skip itself noticeable and slow, working against the point of skipping it.

**Why one segment (two columns), not a has-many model, in v1:** the person building this said v1 needs one segment, with multiple as an explicit future possibility — building a separate `SkipSegment` has-many model now for a feature used by exactly one row per song today is premature. Migrate to a proper model when multiple segments are actually needed, not preemptively.

**Known limitation, not solved in v1:** the standby player slot is shared between "preload the next queued song" and "preload the skip target within the current song" — if a skip segment falls very close to a song's own end, both could want the standby slot at once. Only two player instances exist. Flagged as a rare edge case to revisit if it proves to be a real problem in practice, not solved preemptively.

**Deliberately not beat-aware in v1:** the `start_has_clear_beat`/ `end_has_clear_beat`-driven hard-cut logic (decision #22) isn't applied to skip segments — that logic exists for two *different* songs' rhythms potentially clashing, a different context from jumping within one song (typically the same tempo before and after). Worth revisiting once the core skip mechanic is proven, since the mechanism is shared.

**Implication:** see the "In-song skip segments" section of the `playback-crossfade` skill for the full mechanics.

---

### 26. Transitions are cancellable via a token pattern, not just UI-blocked

**Decision:** Playback has an explicit state (`idle` / `playing` / `transitioning`) as the source of truth. The actual transition logic (song-to-song crossfade, in-song skip) uses a cancellation-token pattern: each transition run gets an incrementing token, and its tick loop checks against that token every step, aborting cleanly if a newer transition supersedes it. A manual skip-to-next click (or, in the future, an admin "play next" override) arriving mid-transition cancels the in-flight ramp and starts the requested one immediately, rather than being blocked or corrupting shared player state. Skip semantics: skip always cancels whatever's in flight and moves to the position *after* the song that was fading in — it never re-triggers the transition it interrupted. In the UI, the skip control is still disabled during `transitioning` (simple and sufficient at the UI layer), with the reason conveyed via `aria-disabled` plus a descriptive accessible name on the control itself (e.g. "Skip to next song, unavailable during transition") — the same approach everywhere, not just on the playback device — rather than being silently inert.

**Why not just disable the button (the simplest option) and stop there:** disabling prevents *manual* mistakes but does nothing for the same class of problem happening automatically — decision #25 already flagged an unresolved case where an in-song skip segment's transition and a next-song preload could both want the standby player slot near a song's end. A UI-only fix wouldn't touch that. The cancellation-token approach fixes both with one rule ("most recently requested transition wins, previous one is cleanly cancelled"), rather than needing a separate fix for the automatic-collision case later.

**Why cancel-and-restart instead of queue-and-wait:** queuing the click until the current transition finishes was considered, but it makes the app feel unresponsive during a multi-second crossfade for what's meant to be an immediate "skip this now" action. Since the transition logic already needs to be cleanly abortable to fix the automatic-collision case, reusing that same capability for manual skip is close to free — no reason to make skip feel laggy when a clean cancel is available.

**Why a descriptive label instead of `aria-live`, and the same way for everyone:** an `aria-live` announcement was the initial idea, but it's wrong for this app specifically — the playback device is the one outputting the party's actual audio (decision #10), and screen-reader speech typically shares that same system audio output by default. An unsolicited spoken announcement would play over the DJ mix itself. Rather than special-case the playback screen differently from the visitor screens (which don't have this conflict), the control's disabled state is conveyed uniformly via `aria-disabled` plus a descriptive accessible name everywhere — spoken only when a screen-reader user actually focuses or activates the control, never pushed unsolicited. This is also the more correct general pattern: `aria-live` is for updates to content the user isn't currently looking at, while a control's own disabled reason belongs on the control. `aria-live` remains appropriate elsewhere (new song added, vote count changes) — this correction is specific to disabled-control state, not a reversal of `aria-live` usage generally.

**Implication:** see "Interrupting and cancelling transitions safely" in the `playback-crossfade` skill for the full mechanics, and the updated "Standby-slot contention" note under "In-song skip segments" (no longer an open unsolved problem, resolved by this same mechanism).

---

### 27. Anything worth an aria-live announcement must also be visible

**Decision:** Any information exposed via an `aria-live` region must also have a visible counterpart for sighted users — a live region is never a screen-reader-only side channel for information the visual UI doesn't otherwise convey. If something seems to need `aria-live` and has no visible representation, that's treated as a sign the visual design is incomplete, not as a case where the live region alone is sufficient.

**Why:** `aria-live` exists to make sure screen reader users don't miss updates that sighted users can already see happening — vote counts ticking up, a new song appearing in the list. If the live region is carrying information nothing on screen shows, it's solving accessibility by making the experience *diverge* between sighted and screen-reader users rather than making it equivalent, which works against the app's accessibility requirement (decision #7) rather than fulfilling it.

**Implication:** this is now the framing for every `aria-live` use in the app, not just future additions — see the updated "Guiding principle" and `aria-live` bullet in the `accessibility` skill. When reviewing or adding a live region, check the visible UI first.

---

### 28. Party messages: text-only, auto-displayed, ephemeral overlay

**Decision:** Visitors can send short text messages (`PartyMessage`, max ~200 chars) from their devices, which automatically appear on the playback screen as a brief overlay near/over the video (a few seconds, then gone), queued one at a time if several arrive in a burst. No creator pre-approval step — messages show as they arrive; the creator can delete any message, senders can delete their own (same session-token ownership pattern as everything else). Delivered over the existing playlist-scoped Turbo Streams channel, no new transport. Text only in v1 — image/photo and short-audio messages are explicitly deferred.

**Why text-only for now:** in a no-accounts app (decision #13), anonymous media uploads displayed on a screen the whole party watches carry meaningfully more risk than text — same reasoning that kept transition sounds to a curated library (decision #20). The person building this accepted this with the note that by the time media messages matter, real accounts will likely exist and/or the app is being used privately among friends rather than publicly — so the deferral is a sequencing choice (media after accounts/moderation), not a permanent rejection. Documented honestly as such rather than pretending the risk was solved.

**Why auto-display rather than creator approval:** an approval queue would put the creator on moderation duty during their own party. For the intended context (a room of friends), instant display plus instant delete is the right tradeoff; an approval mode could be added as a playlist setting later if the app is ever used in less-trusted settings.

**Display constraints:** the overlay must never fully obscure the video (YouTube ToS visibility requirement, and it would look broken); messages queue rather than stack; text must be large (playback screens are viewed from across a room); no sound cue on arrival (would play over the mix — same reasoning as decision #26); entrance/exit animation respects `prefers-reduced-motion`. `displayed_at` is marked so reloading the playback screen doesn't replay the whole party's message history. See "Party messages on the playback screen" in the `playback-crossfade` skill.

---

### 29. Votes are advisory; the creator orders the queue manually

**Decision:** Votes never reorder the queue automatically. Playback order is the creator's manual `position` ordering; vote counts are displayed prominently in the creator's queue view as input to their decisions, nothing more.

**Why:** this was an undefined gap — voting and creator-ordering both existed with no stated relationship. Advisory votes match how the app is actually used (a host curating a set with input from friends, DJ style) and avoid the failure modes of vote-driven ordering: the queue reshuffling under the playback engine mid-party, vote-brigading a song to the top, and the creator's deliberate flow (e.g. slow songs late) being fought by the ranking. Auto-ordering by votes could be a future per-playlist option if wanted.

---

### 30. Playback lifecycle: no finalize step, queue stays live, playback loops

**Decision:** The `status: open | finalized` concept is removed entirely. Playback can start at any time; while it runs, the queue stays fully live — visitors keep suggesting and voting, the creator keeps reordering and removing (new suggestions append to the end). After the last song, playback loops from the top; the last→first transition is a normal transition (same beat-aware duration and transition-sound handling). The playback screen itself is creator-only, gated by `creator_token` like other host actions — otherwise any visitor could start duplicate audio in the room or control playback from their phone.

**Why no finalize:** with play-anytime and an open queue during the party, a lock step has nothing left to do — it was a holdover from an earlier "curate first, then play" model. Removing it simplifies the `Playlist` model and removes a whole class of "what's allowed when finalized?" questions. **Why loop:** at a party, silence after the last song is worse than repetition. **Consequence taken seriously:** queue-changes-during-playback is now normal behavior, not an edge case — the standby player re-cues when the next song changes, and removing the currently-playing song acts as a skip-to-next via the existing cancellation-token mechanism (decision #26). Part of the future "live playback control" feature (#17) — visitors participating during playback — is thereby already in v1; what remains future is remote *admin* control (jump-to-song from phones, multiple admins).

---

### 31. Robustness package from the design review

**Decision:** A design review pass ("what's missing?") produced these, adopted together:

- **Unavailable videos are planned for, not exceptional.** Videos get deleted, region-blocked, age-restricted (these won't play in embeds at all), or have embedding disabled — common for music. Playback listens for IFrame API `onError`, marks the song unplayable in the queue, and auto-skips via the cancellation-token transition. The playback screen also offers a pre-party "check all songs" pass alongside the ad test-playback check.
  - *Considered and rejected: circumventing embed-disabling by opening real youtube.com pages in separate browser windows controlled by a "master" window.* It fails technically before the ToS question even arises: a window opened via `window.open` to youtube.com is cross-origin, so the opener can only set its URL, navigate it, or close it — no `setVolume`, no `getCurrentTime`/`getDuration`, no opacity/layering control. That removes every mechanism the crossfade, trim points, and skip segments depend on, so it couldn't power this app's playback even setting rights concerns aside. The only route that can actually script youtube.com pages is a browser extension (content scripts can run cross-origin), but that's a separate product with its own host-device install burden, is brittle against YouTube's ever-changing page internals (vs. the stable IFrame API), and crosses the line the rest of the design deliberately holds — working within YouTube's rules (ads, player visibility) rather than around a rights holder's explicit choice to disable embedding. The embeddable- alternative path (official audio/lyric uploads, caught by the check-all-songs pass) solves the real party-night problem better anyway. Noted here so it isn't re-explored later.
  - *Future upgrade path (see #33):* the yt-dlp local-download direction would make embed-disabled and region-blocked videos actually playable rather than skipped — the graceful-skip handling here is the iframe-approach's best option, but downloading (in a private/self-hosted deployment) removes the limitation entirely for everything except genuinely deleted videos.
- **Screen Wake Lock + keep-tab-focused requirement.** Background tabs throttle `setInterval` and pause `requestAnimationFrame`, killing the crossfade scheduling; a sleeping screen kills everything. The app requests a screen wake lock (re-requested on `visibilitychange`), and the host-device requirements now include keeping the playback tab focused.
- **Rate-limit unbounded anonymous writes.** Votes are bounded by the unique index, but suggestions and party messages were not — in a no-accounts app, one prankster with the link could flood the queue or the playback screen. Simple per-session-token rate limits on `Song` and `PartyMessage` creation.
- **Never `html_safe` user text.** Message bodies render on a screen the whole party sees; rely on Rails' default escaping.
- **Turbo broadcasts must never re-render the player area.** A broadcast replacing DOM that contains the two `YT.Player` iframes destroys both players mid-song — the player container lives strictly outside every Turbo-updated region.
- **No transition sound on in-song skips** — skips should be unobtrusive jumps, not announced events (previously unstated).
- **Validation guardrails:** `crossfade_seconds` bounded (e.g. 0–15); a skip segment must lie strictly within the song's effective playback range (touching the boundary is a trim, not a skip); degenerate durations (song shorter than the crossfade window or a sound's `climax_offset_seconds`) are clamped at playback time by the pure scheduling functions, which are unit-tested for exactly these inputs (decision #24).
- **`displayed_at` marking** is done by the playback screen and is best-effort, not exactly-once — acceptable since the playback screen is creator-only.

**Why one entry:** these are individually small but came from one coherent review; scattering them across eight entries would bury the signal. Details live in the `playback-crossfade` skill ("Queue lifecycle, looping, and edge cases") and CLAUDE.md's Conventions (rate limiting, escaping) / Real-time updates (Turbo-DOM rule).

---

### 32. Rails 8 (not 7)

**Decision:** Build on Rails 8, not Rails 7. Use Solid Cable (Rails 8's database-backed Action Cable adapter) for the live-sync feature, so no Redis is required.

**Why:** Rails 8 has been the stable release since late 2024 and is mature. The decisive factor for this app specifically is Solid Cable: live cross-device sync (Turbo Streams over Action Cable) is one of the two foundational build-order milestones (see CLAUDE.md "Build order"), and on Rails 7 that would require standing up Redis just to get Action Cable broadcasting across processes. Rails 8's Solid Cable does it with the app's own database (MySQL), removing a whole piece of infrastructure from the exact feature that most needs to work early. Solid Cable is polling-based (~100ms default), which is imperceptible for a party playlist and only matters for latency-critical realtime, which this isn't.

**Compatibility with existing decisions:**
- MySQL (decision #9) is fully supported by the Solid stack — Solid Queue/Cable's `FOR UPDATE SKIP LOCKED` works on MySQL 8+.
- Rails 8's built-in auth generator may make Devise (decision #3) unnecessary when accounts are eventually added — flagged as a reconsider-point on #3 rather than a decision now, since accounts are out of scope for the PoC (#13).

**Note:** Rails 8 also ships Solid Queue (background jobs) and Solid Cache — not needed for the PoC (no background jobs or caching yet), but available without adding Redis if/when they become useful (e.g. Solid Queue for a future broadcast/cleanup job).

---

### 33. Future: local song downloads via yt-dlp (private/self-hosted only, ToS-conflicting)

**Decision (direction capture, explicitly gated — not scheduled):** A future option is to download songs server-side with yt-dlp so playback owns the actual media file, instead of embedding YouTube's IFrame player. This is recorded as a possible future direction for **private/self-hosted deployments only** — not the public app — and is flagged as a deliberate reversal of a stance the project has otherwise held consistently.

**Why it's appealing (it would simplify large parts of the design):**
- No ads at all — removes the host-device ad-free requirement (#18) and the ad-related crossfade-timing risk entirely.
- Real audio access — owning the file means Web Audio API mixing and true sample-accurate crossfades, instead of `setVolume()` ramps on two cross-origin iframes (#10). The whole two-YT.Player workaround exists only because the iframe hides its audio.
- No embed/region restrictions — embed-disabled and region-blocked videos (#31) just work. This is the *specific* fix for the one class of unplayable-video problem that has no workaround under the iframe approach: #31 can only detect embed-forbidden videos and gracefully skip them, whereas an owned file makes them actually playable. (Note: this covers embed-disabled and region-blocked videos — the video exists, YouTube just won't embed/serve it — but not *deleted* videos, which are gone from YouTube entirely and can't be downloaded either. So it's most of the unplayable cases, not all.)
- Reliable offline playback — no mid-party dependency on YouTube's player or the network.
- Much simpler multi-device sync (#10) — once you own the audio file, synchronized playback is an ordinary clock-sync problem without the iframe constraints.
- Real beat mixing (#34) — BPM detection, beat-grid alignment, and time-stretching all become possible with Web Audio API access to the owned file; they're fundamentally impossible in the iframe.

**Why it's future and gated, not just another enhancement:**
- **Direct conflict with YouTube's Terms of Service.** Every playback-related decision so far (ads #18, player visibility and no-in-app-ad-blocking #10/#31, no embed circumvention #31) has deliberately stayed *inside* YouTube's rules. yt-dlp downloading crosses that line squarely. This reverses a consistent project stance, which is exactly why it's recorded as its own decision rather than slipped into the roadmap quietly.
- **Copyright posture changes.** Embedding YouTube's own player is YouTube's licensed distribution; downloading and storing the media is a different legal question. Defensible-ish for genuinely private personal use in some jurisdictions; not something to run as a public service.
- **Real server-side lift.** Download, transcode, storage, and a background-job pipeline (this is where Solid Queue, available from Rails 8 #32 but unused in the PoC, would finally be used), plus ongoing yt-dlp maintenance as YouTube changes.

**Implication if pursued:** it wouldn't just add a feature — it would fork the playback engine (owned-file audio path vs. iframe path), so it should be treated as a distinct playback mode for self-hosted use, not a drop-in replacement. The iframe-based design remains the default for any public/shared deployment.

**Breaks the "playable the instant it's suggested" assumption — the main interaction-model consequence.** In the iframe approach a suggested song is immediately queueable and jumpable-to (the video ID is enough; YouTube streams on demand). Downloading takes time (seconds to minutes, depending on length, server load, and queue depth), so a freshly suggested song can't drop straight into live playback the same way. The existing model absorbs this without a redesign, via a download lifecycle on songs:
- A song in download mode has a state: `pending` → `downloading` → `ready` (or `failed`). Only `ready` songs are eligible to play; the playback engine skips/holds non-ready ones.
- The download runs as a **Solid Queue background job** (the concrete use for Solid Queue noted above), enqueued when the song is suggested (or later — see the eager-vs-lazy fork below).
- **Mitigated by the app's own core use case:** playlists are meant to be built *before* the party (asking friends for songs ahead of time), so downloads finish during the lead time. The pre-party "check all songs" pass (#31) doubles as a "wait for all downloads to complete" gate.
- **Live suggestions during playback still work — just not instantly.** A song added mid-party appears as `pending`, downloads, and becomes playable when `ready`. So it's "live adds join the queue with a delay," not "no live adds." The UI should show download status so it's clear why a just-added song can't be jumped to yet.

**Unresolved sub-fork (flag, don't decide now): eager vs. lazy downloading.** Not every suggested song gets played — some are outvoted or removed (votes are advisory, #29) — so downloading every suggestion eagerly wastes bandwidth and storage. Eager (download on suggest) is simple but wasteful; lazy/on-demand (download only when a song is near the top of the play order) is efficient but more complex and reintroduces some latency right before play. Decide this if/when the download path is actually built.

---

### 34. Beat mixing: not possible in the iframe; a manual phrase-aligned approximation is; true beatmatching belongs to the yt-dlp path

**Decision:** Real beatmatching (tempo-matched, beat-grid-aligned mixing) is **not achievable with the YouTube IFrame player** and is not attempted in the iframe-based design. A limited manual approximation (phrase-aligned crossfades using hand-entered BPM metadata) is *possible* but treated as an optional niche power-user feature, not a default. True beatmatching is recorded as a downstream capability of the future yt-dlp/owned-file playback path (#33), where it's an ordinary (if non-trivial) audio-programming problem.

**Why it's impossible in the iframe — same root cause as #10:** real beatmatching needs three things the cross-origin iframe denies, all stemming from the iframe hiding the audio:
- **BPM/tempo detection** requires analyzing the audio samples — no Web Audio API access to the iframe's audio buffer, so no detection at playback time.
- **Beat-grid alignment** requires ~10ms timing precision; the IFrame API's `seekTo()`/`getCurrentTime()` work at roughly quarter-second granularity with unpredictable buffering jitter — orders of magnitude too coarse.
- **Tempo adjustment** (time-stretch with pitch correction, to reconcile two different BPMs) has no usable IFrame API control. Since crossfading already has to be faked with `setVolume()` ramps because the iframe hides the audio (#10), and beatmatching needs *more* audio control than crossfading, it's simply off the table there.

**The possible iframe approximation (phrase-aligned, not beat-matched):** the app already captures manual beat markers (`start_has_clear_beat`/`end_has_clear_beat`, #22). That could be extended with manually-entered BPM + downbeat-offset metadata per song (entered/tapped by a person, not detected), enough to *schedule the crossfade swap to land on a beat/phrase boundary* of both songs — so a transition feels rhythmically intentional even though neither track's tempo can be nudged. Caveats that keep it niche: it's manual-effort- heavy, and the iframe's timing jitter still fights precise alignment, so it's a power-user nicety at best, not something to build early or enable by default.

**Where real beatmatching lives:** the yt-dlp/owned-file path (#33). Once playback owns the audio file, Web Audio API access makes BPM detection, beat-grid alignment, and time-stretching normal audio problems. So genuine beat mixing is a *downstream feature of download mode*, not the iframe mode — another entry (alongside real audio crossfades and multi-device sync) on the list of things the owned-file path unlocks that the iframe fundamentally can't.

**Status:** the manual phrase-aligned approximation is an optional future enhancement (not on the near roadmap); true beatmatching is gated behind #33 and inherits all of #33's ToS/private-use caveats.

---

### 35. Automation package: decision-log skill, slash commands, html_safe guard hook, axe-core checks, CI

**Decision:** Five automation/validation additions, adopted together (the now-actionable subset of a broader "make repetitive work automatic" review; the rest stays in #15's post-scaffolding plan):

- **`decision-log` skill** — encodes the entry format for `docs/decisions.md` (numbering, Decision/Why/Implication structure, supersede-via-blockquote, cross-referencing) so entries stay consistent without re-explaining the pattern. This was the most-repeated task of the planning phase (35 entries and counting).
- **Slash commands**: `/add-decision <topic>` (append a correctly-numbered entry) and `/pre-merge-check` (walk the pre-merge checklist against the current branch, reporting pass/fail per item — check-only, no auto-repair). Commands rather than skills because they're user-invoked routines, fitting an "I decide when" workflow.
- **`html_safe` guard hook** (`.claude/hooks/check_html_safe.sh`) — deterministically blocks edits introducing `html_safe`/`raw()` in app code, enforcing #31's escaping rule instead of relying on it being remembered. Script written and logic-tested now; wired into `.claude/settings.json` at scaffold time (instructions in the script header). Docs/markdown files are exempt (discussing `html_safe` is fine; using it isn't).
- **Automated accessibility checks** — `axe-core-rspec` assertions (`be_axe_clean`) riding along in each feature's happy-path system spec, turning the detectable part of the a11y requirement (#7) into a deterministic validation loop. Explicitly necessary-not-sufficient: keyboard-flow and screen-reader behavior still need the manual checks in the `accessibility` skill.
- **CI + Dependabot** (roadmap PR 0.1) — GitHub Actions running RSpec + linter on every PR, so "suite passes, linted" from the pre-merge checklist (#14) is enforced server-side rather than trusted locally; Dependabot for gem security updates.

**Why:** the project's conventions are unusually well-documented, which makes deterministic enforcement (hooks, CI, axe) unusually cheap and judgment-based helpers (skill, commands) unusually accurate — the rules they encode already exist in writing. Everything here either removes a repeated manual task or converts a remembered rule into an enforced one; per #15's principle, only the pieces with no dependency on the not-yet-existing app are built now.

**Still deferred to scaffold time (#15, roadmap PR 0.1):** the lint-on-edit and test-on-stop hooks, hook wiring in settings.json, the test-runner/conventions-reviewer subagent, and a PR-description checker — all of which need real commands (`bin/rspec`, linter config) or `gh` context to act on.

---

### 36. Deterministic skill routing: don't rely on remembering to apply skills

**Decision:** Skill application must not depend on anyone (human or Claude) remembering to invoke a skill. Three deterministic layers on top of the built-in probabilistic auto-loading:
- A **skill-routing table in `CLAUDE.md`** ("editing X → consult skill Y") — always in context, since CLAUDE.md loads in every session.
- A **path-based reminder hook** (`.claude/hooks/skill_reminder.sh`, non-blocking): every edit to a governed path (views/UI → `accessibility`, specs → `testing-conventions`, playback code → `playback-crossfade`, `docs/decisions.md` → `decision-log`) injects the matching skill pointer, whether or not the skill was already loaded.
- A **PR template** (`.github/pull_request_template.md`) carrying the pre-merge checklist, so `/pre-merge-check` gets a deterministic prompt at exactly the moment it matters instead of relying on memory.

**Why:** skills auto-load from their descriptions, but that's probabilistic — a mis-matched description or unusual phrasing can mean a governed edit happens without its skill. The layering principle: guidance (skills) can be probabilistic as long as *outcomes* are verified deterministically — and the outcome layer already exists (CI, axe-core assertions, the html_safe hook, the planned lint/test hooks,
#35). These three additions close the remaining gap by making the
*routing* to guidance deterministic too. Net effect: forgetting a skill produces, at worst, a visible red check or an injected reminder — never a silent quality gap.

**Implication:** the reminder hook's path→skill mapping and the CLAUDE.md routing table must be kept in sync when skills are added or renamed (this falls under the pre-merge checklist's "docs current" item, since both are docs/config the change makes stale).

---

### 37. Party-experience feature brainstorm (captured, unscheduled)

**Decision (idea capture, none scheduled):** A brainstorm of future party-experience features is recorded in `docs/roadmap.md` under "Party-experience ideas" — QR-code join overlay, emoji reactions, dedications, optional nicknames, a now-playing page, post-party recap, energy-curve view, DJ handoff, beat-pulsed visuals, and an audience-choice mode. None are committed; they're recorded so good ideas aren't lost and so their design constraints are noted up front.

**Constraints worth pre-registering (so a future implementer doesn't rediscover them):**
- Anything overlaying the playback screen (QR code, reactions, dedications) inherits the party-message overlay rules (#28): never fully obscure the player (YouTube ToS), big-screen-legible, `prefers-reduced-motion` respected, no sound cues over the mix (#26).
- Ephemeral visuals (reactions) ride the existing Turbo Streams channel and need no persistence — but do need the same rate limiting as other anonymous writes (#31).
- **Audience-choice mode conflicts with #29** (votes advisory) and, if ever built, must be an explicit per-playlist opt-in with its own decision entry — a deliberate partial reversal, not a quiet drift.
- Nicknames attach to the existing session tokens (#13) — a display field, not an identity system; they inherit the cookie-loss weakness and that's fine.
- DJ handoff would transfer/duplicate `creator_token` to another device via a short code — incidentally the first mitigation of #13's cookie-loss weakness, worth remembering if that weakness ever hurts before real accounts land.
- Beat-pulsed visuals and the energy curve depend on manual BPM metadata (#34's phrase-alignment groundwork) — another consumer for that metadata if it ever gets built, strengthening its case.

**Also surfaced:** the unresolved duplicate-suggestion question from the design review (reject vs. merge votes for the same `youtube_video_id` in one playlist) — parked in the roadmap to be settled when the suggest/vote PRs (1.2/1.3) are built.

---

### 38. Markdown files use one line per paragraph, not hard-wrapping

**Decision:** All Markdown files (README, CLAUDE.md, decisions, roadmap, skills, commands, PR template) are written with one line per paragraph — each paragraph, list item, and blockquote is a single unbroken line, soft-wrapped by the editor — rather than hard-wrapped at a fixed column width. Blank lines still separate blocks. This replaces the earlier ~72-char hard-wrap convention, and all existing files were converted.

**Why:** hard-wrapped paragraphs (newlines inserted mid-paragraph at ~72 chars) render with spurious blank lines / visible breaks in Markdown viewers that treat single line breaks as `<br>` — GitHub-Flavored-Markdown-style renderers do this, and at least one preview tool in use does. One-line-per-paragraph renders identically everywhere (strict CommonMark and break-happy renderers alike). The tradeoff — longer lines in raw diffs — is minor with modern Git tooling and is a common documentation convention precisely for this reason.

**Implication:** the `decision-log` skill's line-wrapping rule was updated to match, and CLAUDE.md's Conventions note the rule project-wide. When editing any Markdown file, don't reintroduce mid-paragraph hard wraps. (This is genuine house style for docs — the kind of documentation convention that's worth encoding, unlike generic "how to write Markdown" which isn't.)
