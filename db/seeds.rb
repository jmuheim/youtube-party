# Crossfade spike test data.
#
# Major-label music videos routinely block iframe embedding (Vevo/UMG/Sony).
# To check whether a video allows embedding: YouTube → Share → Embed.
# If it shows an embed code, it works. If it says "Embedding disabled", it won't.
#
# Safe sources that reliably allow embedding:
#   - TED / TEDx talks (ted.com channel on YouTube)
#   - NASA official channel
#   - NoCopyrightSounds (NCS) music
#   - Creative Commons / Blender Foundation films
#   - YouTube's own channel (youtube.com/c/YouTube)
#
# end_playback_at: 15 keeps the spike manageable — crossfade fires after ~12 s.
# Replace these IDs with any 3 embeddable videos you prefer.

Video.destroy_all
Video.create!([
  # 18-second video — the very first YouTube upload. Always embeddable.
  { youtube_identifier: "jNQXAC9IVRw", name: "Me at the zoo (first YouTube video)", end_playback_at: 15 },
  # TED talk: "Do schools kill creativity?" — Ken Robinson (usually embeddable)
  { youtube_identifier: "iG9CE55wbtY", name: "Ken Robinson — Do schools kill creativity? (TED)", end_playback_at: 15 },
  # Replace with any embeddable video if either above doesn't play for you.
  { youtube_identifier: "9bZkp7q19f0", name: "PSY — Gangnam Style (may be region-restricted)", end_playback_at: 15 }
])
