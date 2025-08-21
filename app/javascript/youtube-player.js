class YouTubePartyPlayer {
  constructor(containerId, videoId, startAt = 0) {
    this.containerId = containerId;
    this.videoId = videoId;
    this.startAt = startAt;
    this.player = null;
    this.init();
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
}

// --- YouTube API laden ---
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

// --- Next Button Listener ---
document.addEventListener("DOMContentLoaded", () => {
  const nextBtn = document.getElementById("next");
  if (!nextBtn) return;

  nextBtn.addEventListener("click", () => {
    const nextRow = document.querySelector("#videos-playlist tbody tr:not(.played)");
    if (!nextRow) {
      console.log("Playlist leer ✅");
      return;
    }

    // Video als gespielt markieren
    nextRow.classList.add("played");

    const videoId = nextRow.dataset.youtubeIdentifier;
    const startAt = parseFloat(nextRow.dataset.startPlaybackAt || 0);

    // Neuen Container erstellen
    const container = document.createElement("div");
    container.classList.add("yt-player");
    container.id = `player-${Date.now()}`;
    document.body.appendChild(container);

    // neuen Player starten
    new YouTubePartyPlayer(container.id, videoId, startAt);
  });
});
