class YouTubePartyPlayer {
  constructor(containerId, videoId, startAt, previousPlayer = null) {
    this.containerId = containerId;
    this.videoId = videoId;
    this.startAt = startAt;
    this.player = null;
    this.previousPlayer = previousPlayer;
    this.nextPlayer = null;
    this.init();

    if (this.previousPlayer) {
      this.previousPlayer.nextPlayer = this;
    }
  }

  init() {
    this.player = new YT.Player(this.containerId, {
      height: '360',
      width: '640',
      videoId: this.videoId,
      playerVars: { autoplay: 1, controls: 1, start: this.startAt },
      events: {
        onReady: () => console.log(`Player ${this.containerId} ready, video ${this.videoId}`)
      }
    });
  }

  stop() {
    if (this.player) this.player.stopVideo();
  }
}

// --- YouTube API laden ---
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

let player = null;

// --- Next Button Listener ---
document.addEventListener("DOMContentLoaded", () => {
  const nextBtn = document.getElementById("next");
  if (!nextBtn) return;

  nextBtn.addEventListener("click", () => {
    const nextRow = document.querySelector("#videos-playlist tbody tr:not(.played):not(.playing)");
    if (!nextRow) {
      console.log("Playlist leer ✅");
      return;
    }

    // Vorherigen "playing" Track als "played" markieren
    const currentPlaying = document.querySelector("#videos-playlist tbody tr.playing");
    if (currentPlaying) {
      currentPlaying.classList.remove("playing");
      currentPlaying.classList.add("played");
    }

    // Aktuellen Track als "playing" markieren
    nextRow.classList.add("playing");

    const videoId = nextRow.dataset.youtubeIdentifier;
    const startAt = parseFloat(nextRow.dataset.startPlaybackAt);

    // Neuen Container erstellen
    const container = document.createElement("div");
    container.classList.add("yt-player");
    container.id = `player-${Date.now()}`;
    document.body.appendChild(container);

    // neuen Player starten und als previousPlayer speichern
    const nextPlayer = new YouTubePartyPlayer(container.id, videoId, startAt, player);
    player = nextPlayer;
  });
});
