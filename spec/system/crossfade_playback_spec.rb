require "rails_helper"

RSpec.describe "Crossfade playback", type: :system do
  # Pure-function specs: visit the page to load crossfade_math.js into the browser,
  # then call window.CrossfadeMath.* via evaluate_script. No timers involved.
  describe "scheduling math pure functions" do
    before { visit playback_path }

    describe "shouldStartFade" do
      it "returns true when within the crossfade window" do
        expect(evaluate_script("CrossfadeMath.shouldStartFade(57, 60, 3)")).to be true
      end

      it "returns false when outside the crossfade window" do
        expect(evaluate_script("CrossfadeMath.shouldStartFade(50, 60, 3)")).to be false
      end

      it "returns true exactly at the window boundary" do
        expect(evaluate_script("CrossfadeMath.shouldStartFade(57, 60, 3)")).to be true
      end

      it "returns true with crossfadeSeconds 0 only at the very end" do
        expect(evaluate_script("CrossfadeMath.shouldStartFade(60, 60, 0)")).to be true
        expect(evaluate_script("CrossfadeMath.shouldStartFade(59.9, 60, 0)")).to be false
      end
    end

    describe "audioVolumeAtProgress" do
      it "returns full outgoing and silent incoming at progress 0" do
        result = evaluate_script("CrossfadeMath.audioVolumeAtProgress(0)")
        expect(result["outgoing"]).to eq(100)
        expect(result["incoming"]).to eq(0)
      end

      it "returns equal-power levels (~71) at midpoint 0.5" do
        result = evaluate_script("CrossfadeMath.audioVolumeAtProgress(0.5)")
        # cos(π/4) × 100 ≈ 70.7, sin(π/4) × 100 ≈ 70.7 — both round to 71
        expect(result["outgoing"]).to be_within(2).of(71)
        expect(result["incoming"]).to be_within(2).of(71)
      end

      it "returns silent outgoing and full incoming at progress 1" do
        result = evaluate_script("CrossfadeMath.audioVolumeAtProgress(1)")
        expect(result["outgoing"]).to eq(0)
        expect(result["incoming"]).to eq(100)
      end

      it "clamps progress below 0 to 0" do
        result = evaluate_script("CrossfadeMath.audioVolumeAtProgress(-0.5)")
        expect(result["outgoing"]).to eq(100)
        expect(result["incoming"]).to eq(0)
      end

      it "clamps progress above 1 to 1" do
        result = evaluate_script("CrossfadeMath.audioVolumeAtProgress(1.5)")
        expect(result["outgoing"]).to eq(0)
        expect(result["incoming"]).to eq(100)
      end
    end

    describe "opacityAtProgress" do
      it "returns outgoing 1 and incoming 0 at progress 0" do
        result = evaluate_script("CrossfadeMath.opacityAtProgress(0)")
        expect(result["outgoing"]).to eq(1)
        expect(result["incoming"]).to eq(0)
      end

      it "is linear at progress 0.25" do
        result = evaluate_script("CrossfadeMath.opacityAtProgress(0.25)")
        expect(result["outgoing"]).to be_within(0.001).of(0.75)
        expect(result["incoming"]).to be_within(0.001).of(0.25)
      end

      it "returns outgoing 0 and incoming 1 at progress 1" do
        result = evaluate_script("CrossfadeMath.opacityAtProgress(1)")
        expect(result["outgoing"]).to eq(0)
        expect(result["incoming"]).to eq(1)
      end
    end
  end

  describe "playback page" do
    before { Video.create!(youtube_identifier: "dQw4w9WgXcQ", name: "Test video") }

    it "renders the player container and passes the axe accessibility audit" do
      visit playback_path
      expect(page).to have_css("[data-controller='player']")
      expect(page).to have_button("Play playlist")
      # Exclude the YouTube iframes — third-party content we can't control.
      expect(page).to be_axe_clean.excluding("#yt-player-a iframe, #yt-player-b iframe")
    end

    it "shows the page heading" do
      visit playback_path
      expect(page).to have_css("h1", text: "Playback")
    end
  end
end
