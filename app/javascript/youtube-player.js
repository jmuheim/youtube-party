class YouTubePartyPlayer {
  constructor(containerId, videoId, startAt, previousPlayer = null, transitionTime = 0) {
    this.containerId = containerId;
    this.videoId = videoId;
    this.startAt = startAt;
    this.player = null;
    this.previousPlayer = previousPlayer;
    this.nextPlayer = null;
    this.transitionTime = transitionTime; // in seconds
    this.fadeInterval = null;
    this.init();

    this.createVolumeIndicator();

    if (this.previousPlayer) {
      this.previousPlayer.nextPlayer = this;
    }
  }

  createVolumeIndicator() {
    this.volumeIndicator = document.createElement("span");
    this.volumeIndicator.className = "volume-indicator";
    this.volumeIndicator.textContent = "🔊 0";
    const containerElem = document.getElementById(this.containerId);
    if (containerElem) {
      containerElem.parentNode.insertBefore(this.volumeIndicator, containerElem.nextSibling);
    }
  }

  updateVolumeIndicator(volume) {
    if (this.volumeIndicator) {
      this.volumeIndicator.textContent = `🔊 ${volume}`;
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
    // Clear any existing fade
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }

    // Number of steps depends on the transition time, i.e. each 250ms one step (but 100 max)
    const steps = Math.min(100, Math.ceil((duration * 1000) / 250));
    const interval = (duration * 1000) / steps;

    let currentStep = 0;
    this.player.setVolume(startVolume);
    this.updateVolumeIndicator(startVolume);

    this.fadeInterval = setInterval(() => {
      currentStep++;
      const volume = Math.round(
        startVolume + ((endVolume - startVolume) * (currentStep / steps))
      );
      this.player.setVolume(volume);
      this.updateVolumeIndicator(volume);
      if (currentStep >= steps) {
        clearInterval(this.fadeInterval);
        this.fadeInterval = null;
        this.updateVolumeIndicator(endVolume);
        if (typeof onComplete === "function") onComplete();
      }
    }, interval);
  }

  fadeInVolume() {
    this.fadeVolume(0, 100, this.transitionTime);
  }

  fadeOutVolume(duration) {
    // Use the actual current volume from the player
    this.fadeVolume(this.player.getVolume(), 0, duration, () => this.stop());
  }

  stop() {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    this.updateVolumeIndicator(0);
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
  function playVideoFromPlaylist(video) {
    markPreviousPlayingAsPlayed();
    video.classList.add("playing");

    const videoId = video.dataset.youtubeIdentifier;
    const startAt = parseFloat(video.dataset.startPlaybackAt);
    const transitionTime = parseFloat(video.dataset.transitionTime);

    const nextPlayer = new YouTubePartyPlayer(createNewPlayerContainer().id, videoId, startAt, player, transitionTime);
    player = nextPlayer;
  }

  function createNewPlayerContainer() {
    // Create the wrapper div
    const wrapper = document.createElement("div");
    wrapper.classList.add("youtube-iframe");

    // Create the actual player container
    const container = document.createElement("div");
    container.classList.add("yt-player");
    container.id = `player-${Date.now()}`;

    // Append the player container to the wrapper
    wrapper.appendChild(container);

    // Add the wrapper to the document body
    document.body.appendChild(wrapper);

    return container;
  }
  
  function markPreviousPlayingAsPlayed() {
    const currentPlaying = document.querySelector("#videos-playlist tbody tr.playing");
    if (currentPlaying) {
      currentPlaying.classList.remove("playing");
      currentPlaying.classList.add("played");
    }
  }

  document.querySelectorAll('#videos-playlist tbody tr .actions ul li:first-child a').forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();

      const video = link.closest("tr");
      playVideoFromPlaylist(video);
    });
  });

  const nextBtn = document.getElementById("next");
  if (!nextBtn) return;

  nextBtn.addEventListener("click", () => {
    const video = document.querySelector("#videos-playlist tbody tr:not(.played):not(.playing)");
    if (!video) {
      console.log("Playlist leer ✅");
      return;
    }

    playVideoFromPlaylist(video);
  });
});

