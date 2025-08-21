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
      height: '480',
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

  fadeVolume(startVolume, endVolume, duration, onComplete) {
    // Number of steps depends on the transition time, i.e. each 250ms one step (but 100 max)
    const steps = Math.min(100, Math.ceil((duration * 1000) / 250));
    const interval = (duration * 1000) / steps;

    let currentStep = 0;
    this.player.setVolume(startVolume);

    const fade = setInterval(() => {
      currentStep++;
      const volume = Math.round(
        startVolume + ((endVolume - startVolume) * (currentStep / steps))
      );
      this.player.setVolume(volume);
      if (currentStep >= steps) {
        clearInterval(fade);
        if (typeof onComplete === "function") onComplete();
      }
    }, interval);
  }

  fadeInVolume() {
    this.fadeVolume(0, 100, this.transitionTime);
  }

  fadeOutVolume(duration) {
    this.fadeVolume(100, 0, duration, () => this.stop());
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
  // --- "Play now" links ---
  document.querySelectorAll('#videos-playlist tbody tr .actions ul li:first-child a').forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const row = link.closest("tr");
      if (!row) return;

      // Mark previous "playing" as "played"
      const currentPlaying = document.querySelector("#videos-playlist tbody tr.playing");
      if (currentPlaying) {
        currentPlaying.classList.remove("playing");
        currentPlaying.classList.add("played");
      }

      // Mark this row as "playing"
      row.classList.add("playing");

      const videoId = row.dataset.youtubeIdentifier;
      const startAt = parseFloat(row.dataset.startPlaybackAt);
      const transitionTime = parseFloat(row.dataset.transitionTime);

      // Create new container
      const container = document.createElement("div");
      container.classList.add("yt-player");
      container.id = `player-${Date.now()}`;
      document.body.appendChild(container);

      // Start new player and update reference
      const nextPlayer = new YouTubePartyPlayer(container.id, videoId, startAt, player, transitionTime);
      player = nextPlayer;
    });
  });

  // --- Next Button Listener (optional, keep for manual next) ---
  const nextBtn = document.getElementById("next");
  if (!nextBtn) return;

  nextBtn.addEventListener("click", () => {
    const nextRow = document.querySelector("#videos-playlist tbody tr:not(.played):not(.playing)");
    if (!nextRow) {
      console.log("Playlist leer ✅");
      return;
    }

    // Mark previous "playing" as "played"
    const currentPlaying = document.querySelector("#videos-playlist tbody tr.playing");
    if (currentPlaying) {
      currentPlaying.classList.remove("playing");
      currentPlaying.classList.add("played");
    }

    // Mark this row as "playing"
    nextRow.classList.add("playing");

    const videoId = nextRow.dataset.youtubeIdentifier;
    const startAt = parseFloat(nextRow.dataset.startPlaybackAt);
    const transitionTime = parseFloat(nextRow.dataset.transitionTime);

    // Create new container
    const container = document.createElement("div");
    container.classList.add("yt-player");
    container.id = `player-${Date.now()}`;
    document.body.appendChild(container);

    // Start new player and update reference
    const nextPlayer = new YouTubePartyPlayer(container.id, videoId, startAt, player, transitionTime);
    player = nextPlayer;
  });
});
