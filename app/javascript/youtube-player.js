// 1️⃣ YouTube IFrame API dynamisch laden
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

// 2️⃣ Player-Variablen
let player1, player2;
let activePlayer = 1;
let isCrossfading = false;

// 3️⃣ Globale Callback-Funktion für die API
window.onYouTubeIframeAPIReady = function() {
  player1 = new YT.Player('player1', { playerVars: { autoplay: 0, controls: 0 } });
  player2 = new YT.Player('player2', { playerVars: { autoplay: 0, controls: 0 } });
};

// 4️⃣ Next-Button Listener
document.addEventListener("DOMContentLoaded", () => {
  const nextBtn = document.getElementById("next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (!isCrossfading) playNextFromDOM();
    });
  }
});

// 5️⃣ Playlist aus DOM holen (tbody, ohne .played oder .playing)
function getNextVideoRow() {
  return document.querySelector("#videos-playlist tbody tr:not(.played):not(.playing)");
}

function getNextVideoId() {
  const row = getNextVideoRow();
  if (!row) return null;

  // aktuelle Zeile markieren
  row.classList.add("playing");
  return row.dataset.youtubeIdentifier;
}

function playNextFromDOM() {
  const nextVideoId = getNextVideoId();
  if (!nextVideoId) {
    console.log("Playlist leer ✅");
    return;
  }
  crossfade(nextVideoId);
}

// 6️⃣ Crossfade-Logik
function crossfade(nextVideoId) {
  if (isCrossfading) return;
  isCrossfading = true;

  const fadeDuration = 4_000; // 10 Sekunden
  const step = 100;
  let volume1 = 100;
  let volume2 = 0;

  const current = activePlayer === 1 ? player1 : player2;
  const next = activePlayer === 1 ? player2 : player1;

  next.loadVideoById(nextVideoId);
  next.setVolume(0);
  next.playVideo();

  const interval = setInterval(() => {
    volume1 -= 100 * (step / fadeDuration);
    volume2 += 100 * (step / fadeDuration);

    current.setVolume(Math.max(0, volume1));
    next.setVolume(Math.min(100, volume2));

    if (volume1 <= 0 && volume2 >= 100) {
      clearInterval(interval);
      current.stopVideo();
      activePlayer = activePlayer === 1 ? 2 : 1;

      // gerade gespielte Zeile als gespielt markieren
      const playingRow = document.querySelector("#videos-playlist tbody tr.playing");
      if (playingRow) {
        playingRow.classList.remove("playing");
        playingRow.classList.add("played");
      }

      isCrossfading = false;
    }
  }, step);
}

// 7️⃣ Optional: Automatischer Crossfade 10 Sekunden vor Ende
function checkForCrossfade() {
  const current = activePlayer === 1 ? player1 : player2;
  if (!current.getDuration) return;

  const duration = current.getDuration();
  const time = current.getCurrentTime();

  if (duration > 0 && duration - time <= 10) {
    playNextFromDOM();
  }
}
