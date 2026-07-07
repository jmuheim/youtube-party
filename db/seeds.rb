# Spike test data — short end_playback_at so crossfade triggers within ~12 s.
# These are reliably embeddable globally. Swap IDs here if any are blocked in your region.
Video.destroy_all
Video.create!([
  { youtube_identifier: "jNQXAC9IVRw", name: "Me at the zoo (first YouTube video, 18 s)", end_playback_at: 15 },
  { youtube_identifier: "dQw4w9WgXcQ", name: "Rick Astley - Never Gonna Give You Up", end_playback_at: 15 },
  { youtube_identifier: "9bZkp7q19f0", name: "PSY - Gangnam Style", end_playback_at: 15 }
])
