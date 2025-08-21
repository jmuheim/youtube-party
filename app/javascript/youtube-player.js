class YouTubePartyPlayer {
  constructor(containerId, videoId, startAt, previousPlayer = null, transitionTime = 0) {
    this.containerId = containerId;
    this.videoId = videoId;
    this.startAt = startAt;
    this.player = null;
    this.previousPlayer = previousPlayer;
    this.nextPlayer = null;
    this.transitionTime = transitionTime; // in seconds
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
        onReady: (event) => {
          this.fadeInVolume();
        },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING) {
            // Crossfade: fade out previous player instead of stopping immediately
            this.previousPlayer?.fadeOutVolume(this.transitionTime);
          }
        }
      }
    });
  }

  fadeInVolume() {
    if (!this.player || typeof this.player.setVolume !== "function") return;
    const steps = 20;
    const duration = Math.max(0.1, this.transitionTime);
    const interval = (duration * 1000) / steps;
    let currentStep = 0;
    this.player.setVolume(0);

    const fade = setInterval(() => {
      currentStep++;
      const volume = Math.round((currentStep / steps) * 100);
      this.player.setVolume(volume);
      if (currentStep >= steps) clearInterval(fade);
    }, interval);
  }

  fadeOutVolume(duration = 2) {
    if (!this.player || typeof this.player.setVolume !== "function") return;
    const steps = 20;
    duration = Math.max(0.1, duration);
    const interval = (duration * 1000) / steps;
    let currentStep = 0;
    this.player.setVolume(100);

    const fade = setInterval(() => {
      currentStep++;
      const volume = Math.round(100 - (currentStep / steps) * 100);
      this.player.setVolume(volume);
      if (currentStep >= steps) {
        clearInterval(fade);
        this.stop();
      }
    }, interval);
  }

  stop() {
    this.player.stopVideo();
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
    const transitionTime = parseFloat(nextRow.dataset.transitionTime);

    // Neuen Container erstellen
    const container = document.createElement("div");
    container.classList.add("yt-player");
    container.id = `player-${Date.now()}`;
    document.body.appendChild(container);

    // neuen Player starten und als previousPlayer speichern
    const nextPlayer = new YouTubePartyPlayer(container.id, videoId, startAt, player, transitionTime);
    player = nextPlayer;
  });
});
