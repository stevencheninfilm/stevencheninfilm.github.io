(() => {
  'use strict';

  const video = document.getElementById('screening');
  const posterActions = document.querySelector('.poster-actions');
  const posterButton = document.querySelector('.poster-play');
  const error = document.querySelector('.film-error');
  let pendingTime = null;

  if (navigator.connection?.saveData) {
    video.src = video.querySelector('source').src;
  }

  function seekWhenReady() {
    if (pendingTime === null || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    video.currentTime = Math.min(pendingTime, video.duration);
    pendingTime = null;
  }

  function playFilm(time) {
    if (video.error) video.load();
    error.hidden = true;
    video.controls = true;
    video.tabIndex = 0;
    posterActions.hidden = true;
    video.focus({ preventScroll: true });
    // Keep play() in the click handler so the film can start with sound on mobile.
    pendingTime = time;
    seekWhenReady();
    video.play().catch(() => {
      // Native controls remain available if the browser blocks playback.
    });
  }

  function showScreen() {
    video.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  document.querySelectorAll('a[aria-controls="screening"][data-time]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      showScreen();
      playFilm(Number(link.dataset.time));
    });
  });

  function showPoster() {
    video.controls = false;
    video.tabIndex = -1;
    posterActions.hidden = false;
  }

  showPoster();
  video.addEventListener('ended', () => {
    const focusWasOnVideo = document.activeElement === video;
    video.load();
    showPoster();
    if (focusWasOnVideo) posterButton.focus({ preventScroll: true });
  });
  posterButton.addEventListener('click', () => playFilm(null));
  video.addEventListener('loadedmetadata', seekWhenReady);
  function showError() {
    posterActions.hidden = true;
    video.controls = true;
    video.tabIndex = 0;
    error.hidden = false;
  }
  video.addEventListener('error', showError);
  // With nested sources, browsers may report an unsupported film on the last source.
  video.querySelector('source:last-of-type').addEventListener('error', showError);

  document.addEventListener('play', event => {
    if (!event.target.matches('video:not(.beat-loop)')) return;
    document.querySelectorAll('video:not(.beat-loop)').forEach(other => {
      if (other !== event.target && !other.paused) other.pause();
    });
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.querySelectorAll('video').forEach(item => item.pause());
  });
})();
