// 1️⃣ YouTube IFrame API dynamisch laden
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

// 2️⃣ Player-Variablen
let player1, player2;
let activePlayer = 1;
let isCrossfading = false;

// 3️⃣ Hilfsfunktion: nächste Zeile aus DOM (tbody, ohne .played oder .playing)
function getNextVideoRow() {
  return document.querySelector("#videos-playlist tbody tr:not(.played):not(.playing)");
}

// 4️⃣ Next-Button Listener
document.addEventListener("DOMContentLoaded", () => {
  const nextBtn = document.getElementById("next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (!isCrossfading) playNextFromDOM();
    });
  }
});

// 5️⃣ Play Next
function playNextFromDOM() {
  const nextRow = getNextVideoRow();
  if (!nextRow) {
    console.log("Playlist leer ✅");
    return;
  }

  // Aktuell spielenden Track als "played" markieren
  const currentRow = document.querySelector("#videos-playlist tbody tr.playing");
  if (currentRow) {
    currentRow.classList.remove("playing");
    currentRow.classList.add("played");
  }

  // Neue Zeile markieren
  nextRow.classList.add("playing");
  const nextVideoId = nextRow.dataset.youtubeIdentifier;

  // 🎯 Neue Attribute auslesen
  const startAt = parseFloat(nextRow.dataset.startPlaybackAt || 0);
  const endAt = parseFloat(nextRow.dataset.endPlaybackAt || 0); // 0 = bis Ende
  const transitionTime = parseFloat(nextRow.dataset.transitionTime || 4); // default: 4s

  crossfade(nextVideoId, startAt, endAt, transitionTime);
}

// 6️⃣ Crossfade-Funktion
function crossfade(nextVideoId, startAt, endAt, transitionTime) {
  if (isCrossfading) return;
  isCrossfading = true;

  const nextBtn = document.getElementById("next");
  if (nextBtn) nextBtn.disabled = true;

  const fadeDuration = transitionTime * 1000; // Sekunden → ms
  const step = 100;
  let volume1 = 100;
  let volume2 = 0;

  const next = activePlayer === 1 ? player2 : player1;
  const current = activePlayer === 1 ? player1 : player2;

  // aktuelle Klasse "current" updaten
  if (current && current.getIframe) current.getIframe().classList.remove("current");
  if (next && next.getIframe) next.getIframe().classList.add("current");

  // 🎯 Video mit Startzeit laden
  next.loadVideoById({
    videoId: nextVideoId,
    startSeconds: startAt
  });
  next.setVolume(0);
  next.playVideo();

  // Falls Endzeit angegeben → stoppen/überspringen
  if (endAt > 0) {
    const checkEnd = setInterval(() => {
      const t = next.getCurrentTime ? next.getCurrentTime() : 0;
      if (t >= endAt) {
        clearInterval(checkEnd);
        next.stopVideo();
        playNextFromDOM(); // gleich weiter
      }
    }, 500);
  }

  const hasCurrent = current.getDuration && current.getCurrentTime && current.getCurrentTime() > 0;

  const interval = setInterval(() => {
    if (hasCurrent) {
      volume1 -= 100 * (step / fadeDuration);
      volume2 += 100 * (step / fadeDuration);
      current.setVolume(Math.max(0, volume1));
    } else {
      volume2 += 100 * (step / fadeDuration);
    }

    next.setVolume(Math.min(100, volume2));

    if ((hasCurrent && volume1 <= 0 && volume2 >= 100) || (!hasCurrent && volume2 >= 100)) {
      clearInterval(interval);
      if (hasCurrent) current.stopVideo();
      activePlayer = activePlayer === 1 ? 2 : 1;
      isCrossfading = false;
      if (nextBtn) nextBtn.disabled = false;
    }
  }, step);
}

// 7️⃣ YouTube API Ready
window.onYouTubeIframeAPIReady = function() {
  player1 = new YT.Player('player1', { playerVars: { autoplay: 0, controls: 0 } });
  player2 = new YT.Player('player2', { playerVars: { autoplay: 0, controls: 0 } });
};
