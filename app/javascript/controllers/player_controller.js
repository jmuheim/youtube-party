import { Controller } from "@hotwired/stimulus"
import {
  effectiveEndSeconds,
  shouldStartFade,
  fadeProgress,
  audioVolumeAtProgress,
  opacityAtProgress,
  nextIndex
} from "crossfade_math"

// Two-player crossfade (see the playback-crossfade skill): the active slot
// plays at full volume/opacity 1 while the standby slot sits cued, muted, at
// opacity 0. Near the active track's effective end both audio volumes and
// container opacities ramp together off one shared progress value, then the
// slots swap and the following track is cued into the now-idle slot.
export default class extends Controller {
  static values = {
    videos: Array,
    crossfadeSeconds: { type: Number, default: 3 }
  }

  static targets = ["containerA", "containerB", "playButton", "status"]

  connect() {
    // Single injectable seam for all timing (decision #24): specs can replace
    // this.scheduler wholesale to drive the fade without real waits.
    this.scheduler = {
      now: () => performance.now(),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (id) => window.clearInterval(id),
      requestAnimationFrame: (fn) => window.requestAnimationFrame(fn)
    }

    this.currentIndex = 0
    this.readyCount = 0
    this.pollId = null
    // Incremented whenever an in-flight fade must become stale (a new fade
    // starts, or disconnect) — each RAF tick checks it before acting. The
    // full cancellation-token architecture (manual skip etc.) is PR 2.3.
    this.fadeGeneration = 0

    // The containers stay in the DOM permanently and carry the opacity; the
    // YT.Player iframes are created inside them (the API *replaces* the
    // placeholder child, so the iframe must not be the styled element itself).
    this.slots = [
      { player: null, container: this.containerATarget },
      { player: null, container: this.containerBTarget }
    ]
    this.activeSlot = 0
    this.standbySlot = 1

    this._setState("idle")
    this.element.dataset.activeSlot = this.activeSlot

    this._initYouTubeAPI()
  }

  disconnect() {
    this.fadeGeneration += 1
    if (this.pollId !== null) {
      this.scheduler.clearInterval(this.pollId)
      this.pollId = null
    }
    this.slots.forEach(({ player }) => {
      try { player?.stopVideo() } catch { /* player already gone */ }
    })
  }

  // The one real user gesture — everything after this is programmatic, which
  // is exactly the autoplay assumption this spike exists to test on devices.
  play() {
    if (this.state !== "idle") return
    if (this.readyCount < 2) {
      this._setStatus("Players are still loading — try again in a moment.")
      return
    }

    const active = this.slots[this.activeSlot].player
    active.unMute()
    active.setVolume(100)
    active.playVideo()

    // aria-disabled instead of the disabled attribute: the button keeps
    // keyboard focus (disabling the focused element would drop focus to
    // <body>); the state guard above already makes re-clicks no-ops.
    this.playButtonTarget.setAttribute("aria-disabled", "true")

    this._setState("playing")
    this._setStatus(this._nowPlayingText())

    this.pollId = this.scheduler.setInterval(() => this._poll(), 250)
  }

  _initYouTubeAPI() {
    if (window.YT?.Player) {
      this._createPlayers()
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous()
      this._createPlayers()
    }
  }

  _createPlayers() {
    this.slots.forEach((slot, index) => {
      const placeholder = slot.container.querySelector("[data-player-placeholder]")
      slot.player = new window.YT.Player(placeholder, {
        width: "100%",
        height: "100%",
        // playsinline is required for iOS Safari — without it playback jumps
        // into the native fullscreen player and the standby iframe can't show.
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => this._onPlayerReady(index),
          onError: (event) => this._onPlayerError(index, event)
        }
      })
    })
  }

  _onPlayerReady(slotIndex) {
    const { player } = this.slots[slotIndex]
    player.mute()
    player.setVolume(0)

    this.readyCount += 1
    if (this.readyCount === 2) {
      this._cueVideo(this.activeSlot, this.currentIndex)
      this._cueVideo(this.standbySlot, nextIndex(this.currentIndex, this.videosValue.length))
      this._setStatus("Ready.")
    }
  }

  _onPlayerError(slotIndex, event) {
    // Spike scope: surface the error visibly, no auto-skip yet (PR 2.2).
    const video = this.videosValue[slotIndex === this.activeSlot ? this.currentIndex : nextIndex(this.currentIndex, this.videosValue.length)]
    this._setStatus(`Video ${video?.id ?? "?"} failed to load (embedding blocked? error ${event?.data}).`)
  }

  _poll() {
    if (this.state !== "playing") return

    const { player } = this.slots[this.activeSlot]
    const video = this.videosValue[this.currentIndex]
    if (!player || !video) return

    const effectiveEnd = effectiveEndSeconds(video.endAt, player.getDuration())
    if (effectiveEnd > 0 && shouldStartFade(player.getCurrentTime(), effectiveEnd, this.crossfadeSecondsValue)) {
      this._startFade(this.crossfadeSecondsValue)
    }
  }

  _startFade(durationSeconds) {
    if (this.state === "transitioning") return

    this._setState("transitioning")
    const generation = ++this.fadeGeneration

    const standby = this.slots[this.standbySlot].player
    standby.unMute()
    standby.playVideo()

    if (durationSeconds <= 0) {
      this._completeFade(generation)
      return
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const startedAt = this.scheduler.now()

    const tick = () => {
      if (generation !== this.fadeGeneration) return

      const elapsed = (this.scheduler.now() - startedAt) / 1000
      const progress = fadeProgress(elapsed, durationSeconds)

      // One shared progress value drives audio and visuals together.
      const volume = audioVolumeAtProgress(progress)
      this.slots[this.activeSlot].player.setVolume(volume.outgoing)
      this.slots[this.standbySlot].player.setVolume(volume.incoming)

      if (!reducedMotion) {
        const opacity = opacityAtProgress(progress)
        this.slots[this.activeSlot].container.style.opacity = opacity.outgoing
        this.slots[this.standbySlot].container.style.opacity = opacity.incoming
      }

      if (progress < 1) {
        this.scheduler.requestAnimationFrame(tick)
      } else {
        this._completeFade(generation)
      }
    }

    this.scheduler.requestAnimationFrame(tick)
  }

  _completeFade(generation) {
    if (generation !== this.fadeGeneration) return

    const outgoing = this.slots[this.activeSlot].player
    outgoing.stopVideo()
    outgoing.setVolume(0)
    outgoing.mute()

    // Land the end state explicitly — this also covers the hard-cut and
    // prefers-reduced-motion paths, which skip the opacity ramp entirely.
    this.slots[this.activeSlot].container.style.opacity = 0
    this.slots[this.standbySlot].container.style.opacity = 1
    this.slots[this.standbySlot].player.setVolume(100)

    ;[this.activeSlot, this.standbySlot] = [this.standbySlot, this.activeSlot]
    this.element.dataset.activeSlot = this.activeSlot

    this.currentIndex = nextIndex(this.currentIndex, this.videosValue.length)
    this._cueVideo(this.standbySlot, nextIndex(this.currentIndex, this.videosValue.length))

    this._setState("playing")
    this._setStatus(this._nowPlayingText())
  }

  _cueVideo(slotIndex, videoIndex) {
    const video = this.videosValue[videoIndex]
    const { player } = this.slots[slotIndex]
    if (!video || !player) return

    const params = { videoId: video.id }
    if (video.start != null) params.startSeconds = video.start

    player.cueVideoById(params)
    player.setVolume(0)
    player.mute()
  }

  _setState(state) {
    this.state = state
    this.element.dataset.playbackState = state
  }

  // Plain text, deliberately no aria-live: on the playback device, screen
  // reader speech shares the speakers with the party mix (see the
  // playback-crossfade skill).
  _setStatus(text) {
    this.statusTarget.textContent = text
  }

  _nowPlayingText() {
    const video = this.videosValue[this.currentIndex]
    return `Playing ${this.currentIndex + 1} of ${this.videosValue.length}: ${video?.name ?? video?.id ?? "?"}`
  }
}
