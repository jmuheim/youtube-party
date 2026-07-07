import { Controller } from "@hotwired/stimulus"
import { shouldStartFade, audioVolumeAtProgress, opacityAtProgress } from "crossfade_math"

export default class extends Controller {
  static values = {
    videos: Array,
    crossfadeSeconds: { type: Number, default: 3 }
  }

  static targets = ["containerA", "containerB", "playerWrapper", "playButton"]

  connect() {
    // Injectable timer functions — tests can swap these before triggering playback.
    this.rafFn = requestAnimationFrame.bind(window)
    this.setIntervalFn = setInterval.bind(window)
    this.clearIntervalFn = clearInterval.bind(window)

    this.state = "idle"
    this.currentIndex = 0
    this.transitionToken = 0
    this.readyCount = 0
    this.pollIntervalId = null
    this.wakeLock = null

    // Slot 0 → containerA ("yt-player-a"), slot 1 → containerB ("yt-player-b").
    this.slots = [
      { player: null, container: this.containerATarget },
      { player: null, container: this.containerBTarget }
    ]
    this.activeSlot = 0
    this.standbySlot = 1

    this._reRequestWakeLock = async () => {
      if (document.visibilityState === "visible" && this.state !== "idle") {
        await this._acquireWakeLock()
      }
    }

    this._initYouTubeAPI()
  }

  disconnect() {
    if (this.pollIntervalId !== null) {
      this.clearIntervalFn(this.pollIntervalId)
      this.pollIntervalId = null
    }
    document.removeEventListener("visibilitychange", this._reRequestWakeLock)
    if (this.wakeLock) {
      this.wakeLock.release()
      this.wakeLock = null
    }
    this.slots.forEach(({ player }) => {
      if (player) {
        try { player.stopVideo() } catch { /* already destroyed */ }
      }
    })
  }

  // ── Public action ─────────────────────────────────────────────────────────

  play() {
    if (this.state !== "idle") return
    if (!this.slots[this.activeSlot].player) return

    this._acquireWakeLock()

    const activePlayer = this.slots[this.activeSlot].player
    activePlayer.unMute()
    activePlayer.setVolume(100)
    activePlayer.playVideo()

    this.state = "playing"
    this.playButtonTarget.disabled = true
    this.playButtonTarget.setAttribute("aria-disabled", "true")
    this.playButtonTarget.textContent = "Playing…"

    this.pollIntervalId = this.setIntervalFn(() => this._poll(), 250)
  }

  // ── YouTube API initialisation ────────────────────────────────────────────

  _initYouTubeAPI() {
    if (window.YT && window.YT.Player) {
      this._createPlayers()
      return
    }
    // Chain with any existing callback (e.g. another controller on the same page).
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev()
      this._createPlayers()
    }
  }

  _createPlayers() {
    const makePlayer = (elementId, slotIndex) =>
      new window.YT.Player(elementId, {
        height: "360",
        width: "640",
        playerVars: { controls: slotIndex === this.activeSlot ? 1 : 0, rel: 0 },
        events: {
          onReady: () => this._onPlayerReady(slotIndex),
          onError: (e) => this._onPlayerError(slotIndex, e)
        }
      })

    this.slots[0].player = makePlayer("yt-player-a", 0)
    this.slots[1].player = makePlayer("yt-player-b", 1)
  }

  _onPlayerReady(slotIndex) {
    // Both slots start muted and silent; play() provides the first user gesture.
    this.slots[slotIndex].player.mute()
    this.slots[slotIndex].player.setVolume(0)

    this.readyCount += 1
    if (this.readyCount >= 2) {
      this._cueVideo(this.activeSlot, this.currentIndex)
      this._cueVideo(this.standbySlot, this._nextIndex(this.currentIndex))
    }
  }

  _onPlayerError(slotIndex, _event) {
    if (slotIndex === this.activeSlot) {
      if (this.state === "playing") {
        this._startFade(0) // hard cut to next
      } else if (this.state === "idle") {
        // Blocked before Play — advance active and re-cue both slots.
        this.currentIndex = this._nextIndex(this.currentIndex)
        this._cueVideo(this.activeSlot, this.currentIndex)
        this._cueVideo(this.standbySlot, this._nextIndex(this.currentIndex))
      }
    } else if (slotIndex === this.standbySlot) {
      // Standby video blocked — skip ahead to find a playable one.
      const nextIdx = this._nextIndex(this._nextIndex(this.currentIndex))
      this._cueVideo(this.standbySlot, nextIdx)
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  _poll() {
    if (this.state !== "playing") return

    const { player } = this.slots[this.activeSlot]
    if (!player) return

    const currentTime = player.getCurrentTime()
    const video = this.videosValue[this.currentIndex]
    const effectiveDuration = (video?.endAt ?? null) || player.getDuration()

    if (effectiveDuration > 0 && shouldStartFade(currentTime, effectiveDuration, this.crossfadeSecondsValue)) {
      this._startFade(this.crossfadeSecondsValue)
    }
  }

  // ── Fade ──────────────────────────────────────────────────────────────────

  _startFade(crossfadeSeconds) {
    if (this.state === "transitioning") return

    this.state = "transitioning"
    const token = ++this.transitionToken

    const standbyPlayer = this.slots[this.standbySlot].player
    if (standbyPlayer) {
      standbyPlayer.unMute()
      standbyPlayer.playVideo()
    }

    if (crossfadeSeconds === 0) {
      this._completeFade(token)
      return
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const startTime = performance.now()

    const tick = () => {
      if (this.transitionToken !== token) return

      const elapsed = (performance.now() - startTime) / 1000
      const progress = Math.min(elapsed / crossfadeSeconds, 1)

      const { outgoing, incoming } = audioVolumeAtProgress(progress)
      this.slots[this.activeSlot].player?.setVolume(outgoing)
      this.slots[this.standbySlot].player?.setVolume(incoming)

      if (!reducedMotion) {
        const { outgoing: oOut, incoming: oIn } = opacityAtProgress(progress)
        this.slots[this.activeSlot].container.style.opacity = oOut
        this.slots[this.standbySlot].container.style.opacity = oIn
      }

      if (progress < 1) {
        this.rafFn(tick)
      } else {
        this._completeFade(token)
      }
    }

    this.rafFn(tick)
  }

  _completeFade(token) {
    if (this.transitionToken !== token) return

    // Silence and stop the outgoing player.
    const outgoingPlayer = this.slots[this.activeSlot].player
    if (outgoingPlayer) {
      outgoingPlayer.stopVideo()
      outgoingPlayer.setVolume(0)
      outgoingPlayer.mute()
    }
    this.slots[this.activeSlot].container.style.opacity = 0

    // Promote standby to active.
    this.slots[this.standbySlot].container.style.opacity = 1
    this.slots[this.standbySlot].player?.setVolume(100)

    // Swap slots.
    ;[this.activeSlot, this.standbySlot] = [this.standbySlot, this.activeSlot]

    // Advance current track and preload the one after it.
    this.currentIndex = this._nextIndex(this.currentIndex)
    this._cueVideo(this.standbySlot, this._nextIndex(this.currentIndex))

    this.state = "playing"
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _cueVideo(slotIndex, videoIndex) {
    const video = this.videosValue[videoIndex]
    if (!video) return
    const { player } = this.slots[slotIndex]
    if (!player) return

    const params = { videoId: video.id }
    if (video.start != null) params.startSeconds = video.start

    player.cueVideoById(params)
    player.setVolume(0)
    player.mute()
  }

  _nextIndex(index) {
    const len = this.videosValue.length
    if (len === 0) return 0
    return (index + 1) % len
  }

  async _acquireWakeLock() {
    try {
      if ("wakeLock" in navigator) {
        this.wakeLock = await navigator.wakeLock.request("screen")
        document.addEventListener("visibilitychange", this._reRequestWakeLock)
      }
    } catch {
      // Wake Lock unavailable (denied or unsupported) — non-fatal.
    }
  }
}
