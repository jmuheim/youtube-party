// Returns true when the crossfade should begin for the active player.
// effectiveDuration is song.endAt ?? player.getDuration().
export function shouldStartFade(currentTime, effectiveDuration, crossfadeSeconds) {
  return effectiveDuration - currentTime <= crossfadeSeconds
}

// Equal-power volume curve (cos/sin) so perceived loudness stays constant at the midpoint.
// Returns integer volumes 0–100 (setVolume only accepts integers).
export function audioVolumeAtProgress(progress) {
  const p = Math.max(0, Math.min(1, progress))
  return {
    outgoing: Math.round(Math.cos(p * Math.PI / 2) * 100),
    incoming: Math.round(Math.sin(p * Math.PI / 2) * 100)
  }
}

// Linear opacity ramp — linear easing is fine visually (unlike audio, where linear = loudness dip).
export function opacityAtProgress(progress) {
  const p = Math.max(0, Math.min(1, progress))
  return { outgoing: 1 - p, incoming: p }
}

// Expose on window so Cuprite-based unit specs can call these without a module bundler.
if (typeof window !== "undefined") {
  window.CrossfadeMath = { shouldStartFade, audioVolumeAtProgress, opacityAtProgress }
}
