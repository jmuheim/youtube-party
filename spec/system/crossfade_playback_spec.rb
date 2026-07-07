require "rails_helper"

RSpec.describe "Crossfade playback", type: :system do
  # ── Pure scheduling math (decisions #24, #40) ──────────────────────────────
  #
  # The volume of edge-case coverage lives here: these run the real
  # crossfade_math module in the browser through the same importmap the app
  # uses, via dynamic import — no timers, no YT API, no waiting.
  describe "crossfade_math pure functions" do
    def crossfade_math(expression)
      visit playback_path unless page.current_url.include?("/playback")
      evaluate_async_script(<<~JS)
        const done = arguments[0]
        import("crossfade_math").then((m) => done(m.#{expression}))
      JS
    end

    describe "effectiveEndSeconds" do
      it "prefers the trim point over the video duration" do
        expect(crossfade_math("effectiveEndSeconds(15, 300)")).to eq(15)
      end

      it "falls back to the video duration when no trim point is set" do
        expect(crossfade_math("effectiveEndSeconds(null, 300)")).to eq(300)
        expect(crossfade_math("effectiveEndSeconds(undefined, 300)")).to eq(300)
      end

      it "does not swallow an explicit trim point of 0 (nullish, not falsy)" do
        expect(crossfade_math("effectiveEndSeconds(0, 300)")).to eq(0)
      end
    end

    describe "shouldStartFade" do
      it "is false while the remaining time exceeds the crossfade window" do
        expect(crossfade_math("shouldStartFade(50, 60, 3)")).to be false
        expect(crossfade_math("shouldStartFade(56.9, 60, 3)")).to be false
      end

      it "is true from the window boundary onwards" do
        expect(crossfade_math("shouldStartFade(57, 60, 3)")).to be true
        expect(crossfade_math("shouldStartFade(59, 60, 3)")).to be true
      end

      it "with a crossfade of 0 only fires at the very end (hard cut)" do
        expect(crossfade_math("shouldStartFade(59.9, 60, 0)")).to be false
        expect(crossfade_math("shouldStartFade(60, 60, 0)")).to be true
      end
    end

    describe "fadeProgress" do
      it "maps elapsed time linearly onto 0..1" do
        expect(crossfade_math("fadeProgress(0, 3)")).to eq(0)
        expect(crossfade_math("fadeProgress(1.5, 3)")).to eq(0.5)
        expect(crossfade_math("fadeProgress(3, 3)")).to eq(1)
      end

      it "clamps outside the fade duration" do
        expect(crossfade_math("fadeProgress(-1, 3)")).to eq(0)
        expect(crossfade_math("fadeProgress(4.5, 3)")).to eq(1)
      end

      it "treats a zero or negative duration as an instantly complete hard cut" do
        expect(crossfade_math("fadeProgress(0, 0)")).to eq(1)
        expect(crossfade_math("fadeProgress(0.1, -2)")).to eq(1)
      end
    end

    describe "audioVolumeAtProgress" do
      it "starts at full outgoing / silent incoming and ends reversed" do
        expect(crossfade_math("audioVolumeAtProgress(0)")).to eq("outgoing" => 100, "incoming" => 0)
        expect(crossfade_math("audioVolumeAtProgress(1)")).to eq("outgoing" => 0, "incoming" => 100)
      end

      it "meets at ~71/71 at the midpoint (equal-power, no loudness dip)" do
        result = crossfade_math("audioVolumeAtProgress(0.5)")
        expect(result["outgoing"]).to eq(71)
        expect(result["incoming"]).to eq(71)
      end

      it "returns integers (setVolume accepts no fractional values)" do
        result = crossfade_math("audioVolumeAtProgress(0.3)")
        expect(result["outgoing"]).to eq(result["outgoing"].round)
        expect(result["incoming"]).to eq(result["incoming"].round)
      end

      it "clamps progress outside 0..1" do
        expect(crossfade_math("audioVolumeAtProgress(-0.5)")).to eq("outgoing" => 100, "incoming" => 0)
        expect(crossfade_math("audioVolumeAtProgress(1.5)")).to eq("outgoing" => 0, "incoming" => 100)
      end
    end

    describe "opacityAtProgress" do
      it "ramps linearly and complementarily" do
        expect(crossfade_math("opacityAtProgress(0)")).to eq("outgoing" => 1, "incoming" => 0)
        expect(crossfade_math("opacityAtProgress(0.25)")).to eq("outgoing" => 0.75, "incoming" => 0.25)
        expect(crossfade_math("opacityAtProgress(1)")).to eq("outgoing" => 0, "incoming" => 1)
      end

      it "clamps progress outside 0..1" do
        expect(crossfade_math("opacityAtProgress(-1)")).to eq("outgoing" => 1, "incoming" => 0)
        expect(crossfade_math("opacityAtProgress(2)")).to eq("outgoing" => 0, "incoming" => 1)
      end
    end

    describe "nextIndex" do
      it "advances through the queue and loops back to the start" do
        expect(crossfade_math("nextIndex(0, 3)")).to eq(1)
        expect(crossfade_math("nextIndex(2, 3)")).to eq(0)
      end

      it "keeps a single-song queue looping onto itself" do
        expect(crossfade_math("nextIndex(0, 1)")).to eq(0)
      end

      it "stays at 0 for an empty queue" do
        expect(crossfade_math("nextIndex(0, 0)")).to eq(0)
      end
    end
  end

  # ── Page rendering & accessibility ─────────────────────────────────────────
  describe "playback page" do
    it "renders the player scaffold and passes the axe audit" do
      visit playback_path

      expect(page).to have_css("h1", text: "Playback")
      expect(page).to have_button("Play playlist")
      expect(page).to have_css("[data-playback-state='idle']")

      # The two player containers hold third-party YouTube iframes we can't fix.
      expect(page).to be_axe_clean.excluding(
        "[data-player-target='containerA']", "[data-player-target='containerB']"
      )
    end
  end

  # ── Tiny-duration smoke test (decision #40) ────────────────────────────────
  #
  # Hermetic end-to-end wiring check: a fake YT.Player (spec/support/
  # fake_yt_player.js, video clock at 10x wall speed) plus ?crossfade=1 keeps
  # the whole run to a few seconds of real timers. Exhaustive edge cases
  # belong to the pure-function specs above, not here. Capybara auto-waiting
  # matchers only — no sleeps.
  describe "crossfade smoke test with fake players" do
    def install_fake_yt_player
      page.driver.browser.evaluate_on_new_document(
        Rails.root.join("spec/support/fake_yt_player.js").read
      )
    end

    it "crossfades from the first video to the second and swaps the slots" do
      install_fake_yt_player
      visit playback_path(fake_yt: 1, crossfade: 1)

      # Both fake players ready and cued before the one real user gesture.
      expect(page).to have_text("Ready.")
      expect(page).to have_css("[data-playback-state='idle'][data-active-slot='0']")

      click_button "Play playlist"
      expect(page).to have_css("[data-playback-state='playing']")
      expect(page).to have_text("Playing 1 of 3", normalize_ws: true)

      # The first video's trim (endAt 15, at 10x speed) hits the 1s fade
      # window after ~1.4s of wall time; the ramp then runs for 1s.
      expect(page).to have_css("[data-playback-state='transitioning']", wait: 5)
      expect(page).to have_css("[data-active-slot='1']", wait: 5)
      expect(page).to have_css("[data-playback-state='playing']")
      expect(page).to have_text("Playing 2 of 3", normalize_ws: true)

      # Visual end state landed: the former standby is fully visible, the
      # former active is transparent (visible: :all — Capybara counts an
      # opacity-0 element as hidden, but it must stay rendered per YouTube ToS).
      expect(page).to have_css("[data-player-target='containerB'][style*='opacity: 1']")
      expect(page).to have_css("[data-player-target='containerA'][style*='opacity: 0']", visible: :all)

      # The autoplay-chain assumption this spike exists to probe: the standby
      # player was started programmatically, not by a user gesture.
      expect(evaluate_script("window.__fakeYT.players[1].calls.includes('playVideo')")).to be true
      # And the outgoing player was silenced and stopped after the swap.
      expect(evaluate_script("window.__fakeYT.players[0].calls.includes('stopVideo')")).to be true
      expect(evaluate_script("window.__fakeYT.players[0].volume")).to eq(0)
    end
  end
end
