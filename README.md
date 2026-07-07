# YouTube Party

Collaborative playlist building for parties. Before a gathering, invite friends to suggest and vote on songs from YouTube — the host orders the queue (votes are advisory input) and plays it straight from the app, while suggestions and votes keep flowing during the party.

## Why

Asking a group chat for song requests before a party works, but it's messy: requests get lost, duplicates pile up, and there's no sense of what people actually want to hear most. YouTube Party gives every playlist a shareable link where friends can add songs and vote — live.

## Core Features (v1)

- **Create a playlist** — anyone creates a playlist and gets a shareable link; that browser is remembered as the creator (session-based, no account) for host actions
- **No accounts needed (PoC)** — anyone with the link can view, suggest, and vote right away; identity is tracked per-browser via session, not login
- **Add songs via YouTube URL or ID** — paste a link or video ID to add a song (proof-of-concept scope; title/thumbnail search may come later)
- **Vote** — anyone with the link can upvote songs they want to hear (one vote per song per browser)
- **Live updates** — new songs and votes appear in real time (Turbo Streams), no refresh needed
- **Host controls** — the playlist creator's browser reorders and removes songs; votes are advisory (they inform the creator's manual ordering, they don't reorder the queue automatically)
- **Crossfade playback** — the creator plays the playlist from their own device; both the current and next song's video stay visible, crossfading in sync — audio volume and visual opacity transition together — over a short, configurable duration (default a few seconds, adjustable, 0 = hard cut). After the last song, playback loops from the top. The queue stays live during the party — suggestions and votes keep flowing, and the creator can reorder on the fly
- **Trim intros/outros** — each song can have a start and end point, set by the browser that suggested it (or overridden by the creator), so playback skips long intros/outros and the crossfade lines up with the part of the track people actually want to hear
- **Beat-aware crossfades** — each trim point is also classified as "clear beat" or "no beat"; if both the outgoing song's end and the incoming song's start have a clear beat, the transition is forced to a quick, hard cut instead of a long fade, so two songs' beats never overlap and clash — songs without a clear beat at the boundary can still crossfade for as long as configured
- **Transition sound effects (auto-selected, optional)** — the app auto-picks a fitting sound (e.g. a swoosh or an air horn) from a small built-in library for each transition, based on whether it's a quick hard cut or a longer crossfade; anyone can override it with a specific choice, or turn it off for that transition entirely
- **Skip parts within a song** — mark a stretch to skip (e.g. non-music footage in a music video); the app jumps over it with the same crossfade technique used between songs, just much quicker (~1 second)
- **Party messages** — anyone can send a short text message (e.g. "Happy Birthday, Sarah! 🎉") from their phone, which appears briefly as an overlay on the playback screen; senders can delete their own, the creator can delete any
- **Accessible by default** — fully usable via keyboard alone and with a screen reader; semantic HTML first, ARIA only where HTML genuinely can't express the interaction (e.g. live-region announcements for real-time updates)

## Roles & Permissions

No accounts in the PoC — "identity" is just a session token stored in the browser, set automatically the first time it's needed.

| Action                  | Any visitor | Song's Suggester (session) | Creator (session) |
|--------------------------|:---:|:---:|:---:|
| View playlist             | ✅ | ✅ | ✅ |
| Suggest song               | ✅ | — | ✅ |
| Vote (advisory)             | ✅ | ✅ | ✅ |
| Send party message          | ✅ | ✅ | ✅ |
| Delete a party message      | own only | own only | ✅ (any) |
| Set that song's trim points, beat flags, transition sound, skip segment | ❌ | ✅ | ✅ (any song) |
| Reorder songs               | ❌ | ❌ | ✅ |
| Open/control playback screen | ❌ | ❌ | ✅ |
| Remove songs                | ❌ | ❌ | ✅ |

Clearing cookies or switching browsers loses creator/suggester status — there's no recovery mechanism in the PoC. See [`docs/decisions.md`](docs/decisions.md) for why that tradeoff is fine for now.

## Tech Stack

- **Ruby on Rails 8** — using Solid Cable (its database-backed Action Cable adapter) for live updates, so no Redis is needed for the cross-device sync
- **Hotwire** (Turbo Streams + Stimulus) for live updates
- **Session-based identity** — no accounts/login in the PoC; a random token per browser session gates creator/suggester actions
- **MySQL**
- **Plain HTML/CSS** for v1 — no CSS framework yet, styling comes later
- **RSpec + Capybara (Cuprite/Ferrum driver)** for testing — system (browser) specs are the primary coverage, one file per feature area, with unit specs for models/requests/services

See [`docs/decisions.md`](docs/decisions.md) for the reasoning behind these choices, and [`CLAUDE.md`](CLAUDE.md) for architecture and coding conventions used across the codebase.

## Requirements

- **Ad-free playback on the host device.** YouTube embeds show ads by default, and an ad interrupting a track breaks both the crossfade timing and the listening experience. The app can't detect or suppress ads itself (that's not something it's allowed to do within a YouTube embed, and there's no reliable way to detect an ad via the player API either), so whoever's device is driving playback needs either a **YouTube Premium** subscription or an **ad-blocking browser/extension** (e.g. uBlock Origin, Brave, AdBlock Plus). The playback screen includes a one-time test-playback step — play a short clip and visually confirm no ad appears — before starting the real playlist. See `docs/decisions.md` for why this is a host-device setup requirement rather than something built into the app.
- **The playback tab must stay focused and the screen awake.** Browsers throttle timers in background tabs, which breaks the crossfade scheduling. The app requests a screen wake lock, but the host should keep the playback tab in the foreground for the duration of the party (and plug the device in).

## Getting Started

> This is a planning-stage repo; the app itself hasn't been scaffolded yet. Once `rails new` has been run, this section should be updated with real setup steps. Rough outline for when that happens:

```bash
git clone <repo-url>
cd youtube-party
bundle install
cp .env.example .env        # fill in DATABASE_URL, etc.
bin/rails db:setup
bin/dev                     # starts the Rails server
```

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | MySQL connection string (dev/test/prod) |

## Roadmap (post-v1)

- Multi-device synced playback (multiple devices each play the same songs at the same position — not one device streaming audio to others, but every device receiving the same playback commands over the live-sync connection and running its own local YouTube player in step) — a materially different problem (keeping independent players in sync across a network) from single-device crossfade playback
- Live playback control from phones — while a playlist is actively playing (not just before the party), guests keep suggesting/voting in real time, and admins can reorder the queue, jump to a specific song to play next, and choose whether to resume the previous queue position afterward or continue sequentially from the new position. This is about *remote-controlling* the one device that's playing audio, distinct from multi-device audio above — see `docs/decisions.md`
- Search YouTube by title (YouTube Data API v3) instead of pasting a URL/ID
- Transition sound refinements — ducking the songs' volume while a sound effect plays, user-uploaded/community sounds (deferred initially for moderation reasons), smarter auto-selection (e.g. matching sound duration more precisely to the crossfade window)
- Multiple skip segments per song (v1 supports one), and a configurable (rather than fixed ~1s) skip-transition duration
- Image/photo and short-audio party messages — deferred until real accounts and/or a moderation flow exist, since anonymous media uploads onto a screen the whole party watches carry meaningfully more risk than text (which the creator can delete instantly)
- Real accounts (email + login) — would fix the PoC's weak point where clearing cookies loses creator/suggester status, and would let a creator manage playlists across devices/sessions
- Reuse/clone previous playlists for a new event
- Export a playlist (e.g. to a real YouTube playlist or Spotify)
- Session scheduling (tie a playlist to a date/time/event)
- Mobile polish / PWA support

## Repo structure

```
README.md                              # this file
CLAUDE.md                              # lean core conventions, always loaded
docs/decisions.md                      # decision log, numbered entries
docs/roadmap.md                        # suggested PR-by-PR build plan
.claude/skills/playback-crossfade/     # full crossfade architecture detail
.claude/skills/testing-conventions/    # full RSpec/Cuprite conventions + axe-core
.claude/skills/accessibility/          # full ARIA/focus/keyboard guidance
.claude/skills/decision-log/           # how decision entries are written
.claude/commands/                      # /add-decision, /pre-merge-check
.claude/hooks/                         # html_safe guard + skill-routing reminders
.github/pull_request_template.md       # pre-merge checklist in every PR
```

`CLAUDE.md` stays intentionally short — it's loaded into every AI session regardless of task. Deep technical detail that's only relevant to specific work lives in `.claude/skills/` instead, loaded on demand. See decision #19 in `docs/decisions.md`.

## Contributing

See [`CLAUDE.md`](CLAUDE.md) for coding conventions, and specifically its "Build order" section — crossfade playback and live cross-device sync are being validated first before other features are layered in. Each feature lands in its own branch/PR; before merging, see the pre-merge checklist in "Git & pull request workflow" in `CLAUDE.md` (tests, passing suite, lint/format, accurate PR title/description, and every doc or config file the PR touches — `README.md`, `CLAUDE.md`, `docs/decisions.md`, and anything else — kept up to date).

For a rough, ordered PR-by-PR build plan, see [`docs/roadmap.md`](docs/roadmap.md).

## License

TBD.
