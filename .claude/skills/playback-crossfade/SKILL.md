---
name: playback-crossfade
description: "Use when implementing, modifying, or debugging playlist playback — the two-YT.Player crossfade (audio volume + visual opacity), trim-point-based fade timing, beat-aware crossfade duration (start_has_clear_beat/end_has_clear_beat forcing a hard cut), transition sound effects (climax-offset scheduling and auto-selection based on beat classification), in-song skip segments (skipping a mid-song part using the same two-player mechanism), safely cancelling/interrupting an in-flight transition (e.g. skip-to-next clicked mid-crossfade), party message overlays on the playback screen, autoplay/ad handling, or anything in a player_controller.js-style Stimulus controller. Trigger on tasks involving YT.Player, crossfade, play button, trim points affecting playback, beat classification, transition sounds, skip segments, skip-to-next behavior, party messages, or the playback screen generally."
---

# Playback: crossfade architecture

**PoC scope: single device only.** The playlist creator plays the playlist from their own browser (e.g. laptop connected to speakers) — there is no finalize step; playback can start anytime, and the queue stays open (suggestions, votes, creator reordering) while the party is running. The playback screen itself is creator-only (gated by `creator_token`, like other host actions) — otherwise any visitor could start duplicate audio in the room or hijack playback from their phone. Other visitors' devices only ever show the queue/vote UI — they don't play audio. Multi-device synced playback is explicitly future scope (see `docs/decisions.md`) — not one device streaming audio to others, but every device independently playing its own YouTube video/audio locally while receiving the same playback commands, so they stay in step. That's a materially different problem (keeping independent players synchronized across a network), not an extension of this design. Note relaying/streaming audio from one device to others was never actually an option here, technically or by policy — see decision
#10 for why — so it isn't a shortcut being deliberately avoided, it's
simply not on the table.

**Architecture: two `YT.Player` instances, stacked and visible, with a synced audio + visual crossfade.**

The YouTube IFrame API doesn't expose raw audio output (it's a cross-origin iframe — no Web Audio API access), so the only audio crossfade lever is each player's own `setVolume(0–100)` / `mute()` / `unMute()`. Both players' video stay visible at all times (see "Constraints" below — this is a YouTube ToS requirement anyway, not just a UX choice), and the transition between them is represented visually as an **opacity crossfade**, run on the same timer as the audio fade so sound and picture change together rather than drifting apart. This is a client-side-only concern; it belongs in a Stimulus controller (e.g. `player_controller.js`), not the server.

**Layout:** both players are the same size, absolutely positioned in the same container (stacked directly on top of each other). The active player sits at `opacity: 1`, the standby player at `opacity: 0` underneath it, so before a fade starts only the active video is visibly showing even though both are technically rendered.

1. Maintain two player slots: **active** (currently playing, full volume, opacity 1) and **standby** (preloaded via `cueVideoById`, passing the next track's `start_seconds` if set, muted, opacity 0).
2. Poll roughly every 250ms: compute the track's effective end as `song.end_seconds || activePlayer.getDuration()`. Once `effectiveEnd - activePlayer.getCurrentTime()` drops to or below the playlist's `crossfade_seconds`, start the fade. This is why trim points matter for playback, not just editing: without `end_seconds`, the fade would trigger off the raw video length, ignoring a long unwanted outro the suggester or creator trimmed away.
3. Run the fade: unmute and `playVideo()` the standby player (already cued to start at its own `start_seconds`), then on a single fast tick loop (~50ms, or `requestAnimationFrame`) drive both the audio and visual transition together from the same progress value over the configured duration:
   - **Audio**: ramp `setVolume()` down on the active player and up on the standby player using an equal-power curve (e.g. `sin`/`cos` of progress, not linear) to avoid an audible dip in perceived loudness at the midpoint.
   - **Visual**: ramp CSS `opacity` down on the active player's container and up on the standby player's, in sync with the same progress value. A plain linear opacity ramp reads fine visually — no need for the equal-power curve here, that's specifically an audio-perception fix.
   - Driving both from one shared progress value (rather than two independent timers) keeps sound and picture visibly in sync.
4. When the fade completes: stop the old active player, swap the slot references and CSS state (standby → active, now opacity 1/full volume), and preload the next track (with its `start_seconds`) into the now-idle slot (now opacity 0/muted).
5. `crossfade_seconds == 0` skips the ramp entirely — hard cut, both audio and visual switch instantly.

**Beat-aware crossfade duration, per transition.** The playlist's `crossfade_seconds` is the *default*, but the actual duration used for a given song-to-song transition depends on each song's beat classification (`end_has_clear_beat` on the outgoing song, `start_has_clear_beat` on the incoming song):

- If **both** the outgoing song's `end_has_clear_beat` and the incoming song's `start_has_clear_beat` are `true`, force the effective crossfade duration to `0` for that transition — reuses the existing hard-cut path (step 5 above) rather than introducing a new "short fade" mechanism. Two overlapping beats from different songs sound like a rhythm clash, so the transition needs to be instant, not just shorter.
- Otherwise (either side is `false`), use the playlist's configured `crossfade_seconds` unchanged — no cap needed, this is the case where overlap is fine.
- Compute this per-transition when the standby song is queued (it depends on the *pair* of songs — outgoing and incoming — not either song alone), not once at playlist load time.
- **Transition sounds still work with a forced hard cut.** The climax- offset scheduling (see "Transition sound effects" below) is defined relative to `T_swap`, not relative to `crossfade_seconds`, so a `climax_offset_seconds > 0` sound effect still gets cued early and plays through a beat-forced hard cut exactly as it would through a normal fade — no special-casing needed, this falls out of the existing `max(crossfade_seconds, climax_offset_seconds)` lead-time rule already.

**Constraints to design around:**
- YouTube's terms require the player element to remain visible (no `display: none`, no `visibility: hidden`, no zero-size) — this is a hard requirement, not just something we're choosing to lean into for UI. `opacity: 0` on the standby player during its preload/cue phase is fine (still rendered, just visually transparent); don't collapse it out of the layout entirely.
- Respect `prefers-reduced-motion`: if set, skip the opacity ramp (jump straight to the end state) while still doing the audio crossfade — the audio fade is the functional part, the visual fade is a nicety some users may not want.
- `setVolume` only takes integers 0–100, no fractional values — still plenty of resolution for a fade of a few seconds.
- Autoplay: the first user-initiated "Play" click provides the page's user-gesture allowance; subsequent programmatic `playVideo()` calls on the standby player should keep working within that session. **Spike result (PR 0.2, decision #41):** confirmed working on desktop Chrome/Safari. iOS Safari needs one manual tap on the standby player the first time (persists per-site afterwards, even across reload), and pauses the outgoing video the moment the incoming one starts — iOS allows only one unmuted video playing at a time, so overlapping crossfades are impossible there and transitions degrade to hard cuts. Host playback from a desktop browser; the PR 2.2 test-playback step doubles as the iOS priming tap where iOS hosting is unavoidable.
- This is JS-timer-based, not sample-accurate. That's an acceptable tradeoff here — it's for a room of people dancing, not a broadcast mix.
- Validate trim points server-side: `end_seconds` (if set) must be greater than `start_seconds` (if set), and both should be sane relative to the video's actual duration where that's knowable client-side — but since there's no YouTube API call in the PoC, exact duration isn't known server-side, so rely on client-side checks against `player.getDuration()` when the trim UI is used, plus a basic `end_seconds > start_seconds` model validation.
- **Ads can break both the timing and the experience.** YouTube embeds show ads by default (pre-roll/mid-roll) unless the viewer has YouTube Premium — an ad interrupting playback throws off the `getCurrentTime()`/`getDuration()`-based crossfade trigger (see step 2 above), not just the listening experience. The app has no way to detect or suppress ads itself — programmatically blocking or skipping ads within the embed would violate YouTube's terms, so this isn't something to build around in-app. It's an **operational requirement on the host device** instead: whoever's driving playback needs either a YouTube Premium subscription or an ad-blocking browser/extension (e.g. uBlock Origin, Brave, AdBlock Plus) so ads don't play at all. Worth surfacing this as a setup note for whoever hosts, not something the app can guarantee.
- **No reliable in-app ad detection exists either.** The IFrame API's `onStateChange` has no distinct "ad" state — an ad looks like normal `PLAYING` state at the API level. Don't build detection logic around undocumented signals like `getVideoData().video_id` mismatches or suspiciously short `getDuration()` values; those rely on YouTube-internal behavior outside the public API contract and can break silently. Instead, the playback UI should have the host run a **one-time test-playback check** (play a short clip, visually confirm no ad appears) before starting the real playlist — a deterministic human check rather than a fragile runtime heuristic.

See `docs/decisions.md` decisions #10, #16, #18 for the full reasoning behind these choices.

## Transition sound effects (optional, auto-selected by default)

A song can optionally have a `transition_sound` — a short local audio clip (e.g. a swoosh or an air horn) that plays during the crossfade *into* that song. Three states: **auto** (`transition_sound_id` is `nil` and `transition_sound_disabled` is `false` — the default), an **explicit pick** (`transition_sound_id` set), or **explicitly disabled** (`transition_sound_disabled` is `true` — a deliberate silent transition, distinct from "not decided yet").

**This is technically simpler than the YouTube crossfade itself**, since these are local audio files the app actually owns — no cross-origin restriction, real `<audio>`/Web Audio API access, no YouTube ToS constraints. A plain HTML5 `<audio>` element playing concurrently with the two `YT.Player` iframes is enough for v1; the browser mixes multiple concurrent audio sources on its own, no manual audio-graph mixing required.

**Scheduled by climax, not by clip start.** Every `TransitionSound` has a `climax_offset_seconds` — how far into the clip its loudest/most climactic moment falls. A short percussive hit has an offset near 0 (the climax *is* the start); a swoosh with a 3-second buildup before the hit has `climax_offset_seconds: 3.0`. Whatever plays after the climax (echo, decay, tail) just plays out naturally as part of the clip — no separate handling needed for that part.

Scheduling: let `T_swap` be the crossfade's swap moment (the same shared-progress-value midpoint the audio/visual ramp already uses — the point where the two songs' volumes cross over). Start the sound clip playing at `T_swap - climax_offset_seconds`, so the climax lands exactly on the swap, buildup before it, tail after it.

- **Buildup longer than the crossfade itself:** if `climax_offset_seconds > crossfade_seconds`, the sound needs to start before the volume/opacity ramp itself begins. The crossfade-trigger check (see step 2 above) should use `effectiveEnd - activePlayer.getCurrentTime() <= max(crossfade_seconds, climax_offset_seconds)` so the sound gets cued early enough — the audio/visual ramp itself still runs for exactly `crossfade_seconds`, just starting later than the sound clip in that case.
- **Tail bleeding into the next song is fine** — a decaying echo continuing briefly after the crossfade has completed and the new song is already playing at full volume is a normal DJ-effect feel, not a bug to fix.
- Don't time-stretch or loop clips to force-fit `crossfade_seconds` — let each clip's natural length play out; only the *start point* is scheduled, not the duration.

**Auto-selection, when the suggester/creator hasn't picked one.** The beat classification (decision #22) and the resulting effective crossfade duration for a transition are already enough signal to auto-pick a sound that fits — no extra metadata needed beyond what's already there:

- Computed at the same time as the effective crossfade duration itself (when the standby song is queued — depends on the *pair* of adjacent songs, not either song alone, so it can't be decided at suggest-time). Not persisted anywhere; it's a fresh runtime choice each time that transition actually plays, since the queue stays open during the party and which pair is adjacent can change at any time.
- If `song.transition_sound_disabled` is `true`, no sound plays — auto-selection is skipped entirely, this always wins.
- If `song.transition_sound_id` is set, use that — an explicit pick always wins over auto-selection.
- Otherwise, auto-select using the transition's character:
  - **Forced hard cut** (both sides `has_clear_beat`, effective duration `0`, see "Beat-aware crossfade duration" above) → pick randomly among library sounds with a short `climax_offset_seconds` (a rough "quick" bucket, e.g. under ~1 second) — a punchy hit suits an instant cut better than a long buildup.
  - **Normal/longer crossfade** (either side `no_beat`) → pick randomly among sounds with a longer `climax_offset_seconds` (the "sustained" bucket) — a swoosh-style buildup fits a longer overlap window.
  - The exact quick/sustained threshold is a tunable constant, not a firm spec — pick something that feels right once real sounds are in the library.
- Randomizing within the appropriate bucket doubles as the "surprise me" idea from earlier — auto mode already varies the sound each time rather than the app needing a separate randomize toggle.

**v1 scope, deliberately simple:**
- No ducking (temporarily lowering the two songs' volume while the effect plays) in v1 — the sound effect just layers on top of the existing crossfade audio. Ducking is a nice-to-have refinement, not required to prove the feature out; see `docs/decisions.md`.
- The sound library is a small built-in set shipped with the app (seeded `TransitionSound` records), not user-uploaded — avoids moderation concerns for a first version.
- Selection is per-song (the incoming song's `transition_sound`), owned by that song's suggester with creator override — same permission pattern as trim points, see "Permission model" in `CLAUDE.md`.

## In-song skip segments

Some songs (especially music videos) have a stretch that isn't the song itself — dialogue, extended intro visuals, etc. A song can optionally have one internal segment (`skip_start_seconds`/ `skip_end_seconds`) to skip over during playback.

**Reuses the exact same two-player crossfade mechanism** described above, just triggered mid-song instead of at the song boundary, and between two players both loaded with the *same* video rather than two different songs:

1. Poll the same way as the song-to-song trigger (step 2 in the main algorithm), but comparing `activePlayer.getCurrentTime()` against `skip_start_seconds` instead of the track's effective end.
2. When triggered, preload the **standby player with the same `youtube_video_id`**, cued/seeked to `skip_end_seconds` instead of a different song's `start_seconds`.
3. Run the identical audio+visual crossfade ramp (shared progress value, equal-power audio curve, linear opacity), but over a much shorter, fixed duration (~1 second) rather than the playlist's `crossfade_seconds` — this should read as a quick jump cut, not a blended transition. Not user-configurable in v1; a fixed constant.
4. After the ramp completes, swap slots as usual — the song continues playing from `skip_end_seconds` onward in what's now the active player.

**Standby-slot contention is resolved by the cancellation-token mechanism below**, not left unsolved: if a skip segment's transition and a next-song preload both want the standby slot near a song's own end, whichever is requested/triggered most recently wins and the other is cleanly cancelled — see "Interrupting and cancelling transitions safely".

**Deliberately out of scope for v1** (see `docs/decisions.md`):
- **Multiple skip segments per song.** v1 supports exactly one; the two-column (`skip_start_seconds`/`skip_end_seconds`) design on `Song` is intentionally not a separate has-many model yet — migrate to one when multiple segments are actually needed, not preemptively. Reflects the same skip transition would apply to as many segments as needed once/if that model change happens.
- **Beat-aware hard cuts for skip segments** (the same `start_has_clear_beat`/`end_has_clear_beat`-driven hard-cut logic from song-to-song transitions) — not applied here in v1, since a skip segment is within the same song (same tempo, typically), a different context from two different songs' rhythms clashing. Worth revisiting once the core skip mechanic works, since the underlying mechanism is shared.

## Interrupting and cancelling transitions safely

Playback now has several kinds of in-flight, timer-driven transitions (song-to-song crossfade, in-song skip segment, transition sound scheduling) that mutate shared state — the two player slots, their volume, their opacity. A manual action (skip-to-next, an admin "play next" override once that future feature exists) or a second automatic trigger arriving mid-transition must not be allowed to corrupt that shared state or produce two competing ramp loops fighting over the same player's volume/opacity simultaneously.

**Explicit playback state** (`idle` / `playing` / `transitioning`) is the single source of truth. Every ramp (song-to-song, in-song skip) sets it; every user/admin action and the UI both read it before acting.

**Cancellation-token pattern for the actual transition logic**, not just a UI-level lock:
- Each transition run gets an incrementing token when it starts.
- Its tick loop checks "am I still the current transition?" against that token on every step, and aborts cleanly (stop timers, leave both players in a sane stopped/known state) the moment a newer transition supersedes it — rather than continuing to run alongside a second, conflicting ramp.
- A manual skip-to-next arriving mid-transition doesn't need to be *prevented* to be safe: it can cancel the in-flight ramp and immediately start the actually-requested transition. Same mechanism resolves the standby-slot contention between a skip segment and a next-song preload noted above — "most recent request wins, the previous one is cancelled" is one rule covering both the manual and automatic collision cases.
- **Skip semantics while already transitioning:** skip-to-next cancels whatever's in flight and moves to the position *after* the song that was fading in — i.e. it always skips past the currently-becoming- active song, never re-triggers/repeats the transition into it. This keeps behavior predictable regardless of when in a transition the click lands.

**UI: disable the skip control during `transitioning`, but don't leave it silently inert.** A disabled button with no explanation is a rough experience for keyboard/screen-reader users specifically — but don't use an `aria-live` announcement for this. On the playback device specifically, screen-reader speech typically comes out through the same system audio output as everything else — an announcement would play over the party's actual mix through the speakers, which defeats the purpose. Rather than treat the playback screen as a special case, use the same approach everywhere: set `aria-disabled="true"` and give the control a descriptive accessible name (e.g. "Skip to next song, unavailable during transition") instead of its normal label. This is only spoken when a screen-reader user actually focuses or tries to activate the button — not pushed unsolicited — and it's also the more correct pattern generally: `aria-live` is for updates to content the user isn't currently looking at, while "why is the control I'm about to press disabled" belongs on the control's own state.

## Party messages on the playback screen

Visitors can send short text messages (`PartyMessage`) from their phones — e.g. a "Happy Birthday!" note — which appear on the playback screen. Text-only in v1; image/audio messages are deferred (see `docs/decisions.md`).

**Display mechanics:**
- Messages appear automatically as they arrive (via the same Turbo Streams live-sync channel as queue/vote updates — no new transport needed), shown as an overlay near/over the video for a few seconds, then disappear. They are ephemeral on screen but persisted in the DB (the creator can delete any message; the sender can delete their own).
- **Don't fully obscure the video** — YouTube's terms require the player to remain visible, and a full-screen opaque overlay would also just look broken. Position the overlay at an edge/corner of the video or banner-style along the bottom, semi-transparent background, never covering the whole player.
- **Queue, don't stack:** if several messages arrive in a burst, show them one at a time in arrival order, each for its few seconds — overlapping messages would be unreadable on a screen viewed from across a room.
- Mark `displayed_at` when shown so a reload of the playback screen doesn't replay everything from the start of the party.
- Font size matters more than usual: the playback screen is typically viewed from a distance (TV/projector across a room) — message text should be large.
- Respect `prefers-reduced-motion` for the message entrance/exit animation, same as the crossfade's opacity ramp — a static appear/disappear is fine.
- Messages are visual-only on the playback screen — no sound cue in v1 (would interfere with the mix, same reasoning as decision #26's aria-live correction).

## Queue lifecycle, looping, and edge cases

**Votes are advisory.** Playback order is the creator's manual `position` ordering; votes inform the creator's choices but never reorder the queue automatically. Show vote counts prominently in the creator's queue view so they can act on them, but don't sort by votes.

**No finalize step.** Playback can start anytime, and while it runs the queue stays fully live: visitors keep suggesting/voting, the creator keeps reordering/removing. New suggestions append to the end of the queue by default.

**Looping:** after the last song, playback continues from the first song — it's a party, silence is worse than repetition. The last→first transition is a normal transition: same beat-aware duration logic (last song's `end_has_clear_beat` vs first song's `start_has_clear_beat`), same transition-sound handling.

**Queue changes while playing (normal, not an edge case here):**
- If the song currently *preloaded in the standby slot* is removed or is no longer the next song (reorder), re-cue the standby player with the new next song. The "which song is next" lookup should happen against current queue state, re-checked when a broadcast changes the queue — not cached once at song start.
- If the *currently playing* song is removed by the creator, treat it as a skip-to-next (reuse the cancellation-token transition, decision
  #26).
- A playlist reduced to one song just loops that song (with its own end→start transition); reduced to zero songs while playing, stop playback and show an empty-queue state.

**Unavailable videos (will happen — plan for it, don't treat as exceptional):** YouTube videos get deleted, region-blocked, age-restricted (age-restricted videos won't play in embeds at all), or have embedding disabled by the uploader — music content especially.
- At playback time: listen for the IFrame API's `onError` events on both players; on error, mark the song visibly as unplayable in the queue and auto-skip to the next song (cancellation-token transition again). Never let an error freeze playback silently.
- Pre-party: alongside the ad test-playback check, offer a "check all songs" pass on the playback screen that cues each video briefly and flags unplayable ones while there's still time to replace them.

**Keep the playback tab alive:** browsers throttle `setInterval` heavily and pause `requestAnimationFrame` entirely in background tabs — the crossfade polling dies if the host switches tabs, and the screen sleeping kills everything. Use the Screen Wake Lock API (`navigator.wakeLock.request('screen')`, re-request on `visibilitychange` since it's released when the tab is hidden), and show a clear host-facing notice that the playback tab must stay focused/visible during the party. Document this alongside the ad-free requirement as host-device setup.

**No transition sound on in-song skips.** Auto-selection and explicit transition sounds apply to song-to-song transitions only — a skip within the same song should be an unobtrusive jump, not an announced event.

**Validation guardrails (server-side model validations, mirroring the trim-point ones):**
- `crossfade_seconds`: bounded to a sane range (e.g. 0–15).
- Skip segment must lie within the song's effective playback range: `start_seconds (or 0) < skip_start_seconds < skip_end_seconds < end_seconds (or video end)` — a skip touching the very start/end is really a trim, not a skip.
- Degenerate durations are a playback-time concern (video length isn't known server-side in the PoC): if a song's effective length is shorter than the applicable crossfade window or a transition sound's `climax_offset_seconds`, clamp — shorten the fade to fit, start the sound late (skipping part of its buildup) rather than crashing or double-triggering. The pure scheduling functions (decision #24) should handle these inputs explicitly and be unit-tested for them.

**`displayed_at` for party messages:** the playback screen marks a message displayed when it shows it. Since the playback screen is creator-only, "two playback screens racing" is limited to the creator opening it twice — acceptable; the mark just prevents replaying history on reload, it doesn't need to be a strict exactly-once guarantee.
