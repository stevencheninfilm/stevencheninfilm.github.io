// Model the engine's public contract: temporary native resets must not become
// user intent, and controllers own resuming once the whole group is restored.
module.exports = function progressiveFixture(window, root, videos) {
  let switching = false;
  const intents = new Map(), durations = new Map();
  const snapshot = video => ({ paused: video.paused, time: video.currentTime, muted: video.muted, volume: video.volume, playbackRate: video.playbackRate });
  window.ProgressiveVideo = {
    isSwitching: video => switching && videos.includes(video),
    getIntent: video => ({ ...(intents.get(video) || snapshot(video)) }),
    setIntent(video, patch) {
      if (!switching) return false;
      const targets = 'paused' in patch || 'time' in patch ? videos : [video];
      targets.forEach(target => Object.assign(intents.get(target), patch));
      return true;
    }
  };
  return {
    intent: video => window.ProgressiveVideo.getIntent(video),
    begin(options = {}) {
      videos.forEach(video => { intents.set(video, snapshot(video)); durations.set(video, video.duration); });
      switching = true;
      root.fire('progressive-video:switch-start', { detail: { videos, ...options } });
    },
    reset(video) {
      video.pause(); video.currentTime = 0; video.duration = NaN; video.readyState = 0;
      video.fire('durationchange'); video.fire('timeupdate'); video.fire('error');
    },
    finish(type = 'end', { pending = false, reason } = {}) {
      if (!pending) videos.forEach(video => {
        const state = intents.get(video);
        video.duration = durations.get(video); video.currentTime = state.time;
        video.muted = state.muted; video.volume = state.volume; video.playbackRate = state.playbackRate;
        video.error = null; video.readyState = 3;
        video.fire('loadedmetadata'); video.fire('seeked'); video.fire('canplay');
      });
      switching = false;
      const detail = { videos, reason };
      root.fire(`progressive-video:switch-${type}`, { detail });
      return detail;
    },
    downloadError() { root.fire('progressive-video:switch-error', { detail: { videos } }); }
  };
};
