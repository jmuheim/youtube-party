// Pure scheduling math for the two-player crossfade (decision #24: extracted
// from day one so tests drive synthetic inputs instead of waiting on timers).
// No DOM, no globals, no YT API — every function is a plain calculation.

// A song's effective end for fade-triggering purposes. endAt is the trim
// point (may legitimately be absent); duration is player.getDuration().
// Nullish (not ||) so an explicit endAt of 0 wouldn't be swallowed.
export function effectiveEndSeconds(endAt, duration) {
  return endAt ?? duration
}

// True once the remaining time in the active track is within the crossfade
// window — with crossfadeSeconds 0 this only fires at/after the very end.
export function shouldStartFade(currentTime, effectiveEnd, crossfadeSeconds) {
  return effectiveEnd - currentTime <= crossfadeSeconds
}

// Progress (0–1) of a fade that has run for elapsedSeconds. A zero/negative
// duration is a hard cut: immediately complete.
export function fadeProgress(elapsedSeconds, crossfadeSeconds) {
  if (crossfadeSeconds <= 0) return 1
  return clamp01(elapsedSeconds / crossfadeSeconds)
}

// Equal-power volume curve (cos/sin) so perceived loudness stays constant
// through the midpoint — a linear ramp dips audibly there. Integers 0–100
// because YT.Player#setVolume accepts no fractional values.
export function audioVolumeAtProgress(progress) {
  const p = clamp01(progress)
  return {
    outgoing: Math.round(Math.cos(p * Math.PI / 2) * 100),
    incoming: Math.round(Math.sin(p * Math.PI / 2) * 100)
  }
}

// Linear opacity ramp. Linear reads fine visually — the equal-power curve
// above is specifically an audio-perception fix, not needed here.
export function opacityAtProgress(progress) {
  const p = clamp01(progress)
  return { outgoing: 1 - p, incoming: p }
}

// Next queue index, looping back to the start after the last track.
export function nextIndex(index, length) {
  if (length === 0) return 0
  return (index + 1) % length
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}
