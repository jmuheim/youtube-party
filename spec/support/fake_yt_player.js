// Fake YT.Player for the crossfade smoke test. Installed by
// spec/system/crossfade_playback_spec.rb via CDP (runs before any page
// script). Self-guarded: only activates when the URL carries fake_yt=1, so
// it can never leak into other specs even if the injected script outlives a
// single test's page.
(function () {
  if (!window.location.search.includes("fake_yt=1")) return

  // The first player's video time advances 10x faster than wall time, so the
  // first track's ~15s trim reaches the crossfade window within ~1.5s of real
  // test time. Every later player runs at 1x so the *next* transition stays
  // comfortably outside the test's assertion window — otherwise the second
  // fade starts ramping the just-retired player back up mid-assertion. The
  // fade ramp itself always runs on wall time (the controller's scheduler),
  // which is why the spec also passes ?crossfade=1.
  var FIRST_PLAYER_RATE = 10

  window.__fakeYT = { players: [] }

  class FakePlayer {
    constructor(_element, options) {
      this.options = options || {}
      this.rate = window.__fakeYT.players.length === 0 ? FIRST_PLAYER_RATE : 1
      this.calls = []
      this.videoId = null
      this.baseTime = 0
      this.playing = false
      this.playStartedAt = null
      this.volume = 100
      this.muted = false
      window.__fakeYT.players.push(this)
      // The real API constructs players asynchronously — defer onReady so the
      // controller has assigned slot.player before the callback runs.
      setTimeout(() => this.options.events?.onReady?.({ target: this }), 0)
    }

    cueVideoById(params) {
      this.calls.push("cueVideoById")
      this.videoId = params.videoId
      this.baseTime = params.startSeconds || 0
      this.playing = false
    }

    playVideo() {
      this.calls.push("playVideo")
      if (!this.playing) {
        this.playing = true
        this.playStartedAt = performance.now()
      }
    }

    stopVideo() {
      this.calls.push("stopVideo")
      if (this.playing) {
        this.baseTime = this.getCurrentTime()
        this.playing = false
      }
    }

    getCurrentTime() {
      if (!this.playing) return this.baseTime
      return this.baseTime + ((performance.now() - this.playStartedAt) / 1000) * this.rate
    }

    getDuration() {
      return 30
    }

    setVolume(volume) {
      this.calls.push("setVolume")
      this.volume = volume
    }

    mute() {
      this.calls.push("mute")
      this.muted = true
    }

    unMute() {
      this.calls.push("unMute")
      this.muted = false
    }
  }

  // Non-writable so the real iframe_api script (still loaded by the page)
  // can't replace the fake before the Stimulus controller grabs YT.Player.
  Object.defineProperty(window, "YT", {
    value: { Player: FakePlayer },
    writable: false,
    configurable: false
  })
})()
