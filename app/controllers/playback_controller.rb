class PlaybackController < ApplicationController
  # Spike data (roadmap PR 0.2): hardcoded — no models, DB, or permissions
  # yet. Real Playlist/Song models arrive in PR 1.1. Trims (start/endAt) keep
  # each track short so crossfades fire within seconds during manual testing.
  #
  # Major-label music videos routinely block iframe embedding (player errors
  # 101/150). To check a candidate: YouTube → Share → Embed — if it offers an
  # embed code it works. Reliably embeddable sources: Blender Foundation
  # films, NoCopyrightSounds, TED, YouTube's own uploads.
  SPIKE_VIDEOS = [
    { id: "jNQXAC9IVRw", name: "Me at the zoo (first YouTube video)", endAt: 15 },
    { id: "aqz-KE-bpKQ", name: "Big Buck Bunny (Blender Foundation)", start: 10, endAt: 25 },
    { id: "K4DyBUG242c", name: "Cartoon — On & On (NoCopyrightSounds)", endAt: 15 }
  ].freeze

  def show
    @videos = SPIKE_VIDEOS
    # Spike affordance: ?crossfade=1 lets manual testing and the smoke spec
    # use tiny durations (0 = hard cut). Range mirrors the planned
    # Playlist#crossfade_seconds validation (see the playback-crossfade skill).
    @crossfade_seconds = params.fetch(:crossfade, 3).to_i.clamp(0, 15)
  end
end
