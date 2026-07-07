---
name: testing-conventions
description: "Use when writing, organizing, or reviewing RSpec tests for this app — deciding whether to extend an existing spec file vs. create a new one, choosing system vs. unit spec, setting up Cuprite/Ferrum for a browser test, or testing time-sensitive/JS-timer-based behavior like the crossfade, transition sound scheduling, or live-sync polling without slow real-time waits. Trigger on tasks involving spec files, RSpec, Capybara, Cuprite, system tests, test coverage for a new feature, or testing anything that involves setTimeout/setInterval/requestAnimationFrame/polling."
---

# Testing conventions

**Framework:** RSpec (not Minitest). **Browser driver:** Cuprite (backed by Ferrum) — talks to Chrome directly via the DevTools Protocol, no Selenium/chromedriver version juggling, and generally faster and less flaky for Hotwire apps than Selenium.

**System specs (browser tests) are the primary source of confidence.** Every happy path and most meaningful edge cases should be covered by a system spec (`spec/system/`) driving a real browser via Cuprite. This includes accessibility-relevant interactions — e.g. a system spec that completes a flow using only keyboard navigation is more valuable here than a unit test asserting a `<button>` exists.

- **Extend existing browser specs rather than creating new ones where possible.** Browser/JS specs are the most expensive part of the suite to run; prefer adding a scenario to an existing, related system spec (via a new `context`/`it` block) over spinning up a whole new spec file with its own browser boot, when the new scenario is testing the same feature area.
- **Organize system specs into one file per feature** (e.g. `spec/system/suggesting_songs_spec.rb`, `spec/system/voting_spec.rb`, `spec/system/crossfade_playback_spec.rb`, `spec/system/live_sync_spec.rb`) rather than one giant catch-all spec or a separate file per tiny scenario. Within a feature's file, combine related scenarios/edge cases using nested `describe`/`context` blocks so failures stay easy to localize even though they share a file and setup. Example: `voting_spec.rb` can cover voting, un-voting, a duplicate-vote attempt, and vote counts updating live — one file, several scenarios — rather than four separate spec files.
- Start a new file when a scenario belongs to a genuinely different feature area, not just because it's a different edge case of the same feature.

**Automated accessibility checks run inside system specs.** Use the axe-core RSpec integration (`axe-core-rspec` gem) so every page a system spec visits gets a WCAG audit: `expect(page).to be_axe_clean` (scoped/excluded where third-party content like the YouTube iframes can't be fixed by us). Add the assertion to the main happy-path spec of each feature area rather than a separate a11y suite — it rides along for free on pages the specs already visit. This automates the *detectable* part of the accessibility requirement (missing labels, contrast, ARIA misuse); keyboard-flow and screen-reader behavior still need the manual checks from the `accessibility` skill — axe passing is necessary, not sufficient.

**Unit-level tests still matter** and should cover what system specs don't efficiently reach:
- `spec/models/` — validations, associations, scopes, callbacks (e.g. the one-vote-per-browser-per-song constraint).
- `spec/requests/` (preferred over `spec/controllers/` per current RSpec Rails conventions) — session-token permission checks (creator vs. suggester vs. any visitor), status codes, redirects.
- `spec/services/` — e.g. YouTube URL/ID parsing and validation logic. Once search replaces URL/ID pasting, this is also where `YoutubeSearchService` specs go (stubbing the HTTP layer rather than hitting the real API).
- `spec/jobs/` and Turbo Stream broadcast behavior, if/when broadcasting logic moves into a job or concern worth testing in isolation.

**Deferred:** screenshot/visual regression tests. Planned once real CSS is introduced (see `docs/decisions.md`) — not needed while the app is plain HTML. Leading candidate for when that happens: `capybara-screenshot-diff` (pairs naturally with the RSpec/Cuprite setup above, runs in-suite rather than requiring a paid SaaS like Percy or Chromatic) — not finalized, revisit when CSS lands.

## Testing time-sensitive behavior (crossfade, transition sounds, live sync)

The crossfade, transition-sound scheduling, and Turbo Streams live sync are all JS-timer-based (`setInterval`/`requestAnimationFrame`/polling). Testing them by waiting for real time to pass is slow and encourages either flaky short waits or slow "just in case" long ones. Prefer these, roughly in order of preference (fastest/most reliable first):

- **Extract the scheduling math into pure functions and unit-test those with synthetic inputs — no waiting at all.** Things like "given `currentTime`/`duration`/`crossfade_seconds`/`climax_offset_seconds`, should the fade be starting now? what's the opacity/volume at progress X? what's the effective crossfade duration for this song pair?" are pure calculations once separated from the timer that calls them. This is where the *volume* of edge-case coverage should live — it's instant, so there's no cost to being thorough.
- **Inject a controllable/fake clock instead of relying on real timers.** The crossfade controller shouldn't call `setInterval`/`requestAnimationFrame` directly in a way that's opaque to tests — have it accept an injectable scheduler. Production uses real timers; tests swap in one that's stepped manually (e.g. `controller.tick(250)`), so the exact same logic runs but the test drives time synchronously instead of waiting for it to elapse.
- **Stub `YT.Player` for specs that are really about scheduling logic, not YouTube itself.** Inject a fake `YT.Player` class with `getCurrentTime()`/`getDuration()` etc. returning values the test controls, and a way to jump them instantly. This also removes flakiness from real YouTube (network, ads, autoplay quirks) for specs that don't need the real embed to make their point.
- **For the few specs that do exercise real timers end-to-end, use tiny durations, not realistic ones** — a 5-second test clip and a 1-second `crossfade_seconds`, not a 3-minute song and a 3-second fade. These are smoke tests confirming the wiring works, not where exhaustive edge-case coverage belongs (that's the pure-function layer above).
- **Never use a fixed `sleep`.** Use Capybara's auto-waiting matchers (`expect(page).to have_css(...)`, etc.), which retry until they pass or hit the configured timeout — applies to live-sync specs (`Capybara.using_session` for multi-device scenarios) just as much as crossfade specs.

See `docs/decisions.md` decisions #8 and #24 for the full reasoning behind these choices.
