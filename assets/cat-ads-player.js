(() => {
  'use strict';

  const video = document.getElementById('screening');
  const watch = document.querySelector('.watch');
  const watchLabel = watch.querySelector('.watch-label');
  const posterButton = document.querySelector('.poster-play');
  const error = document.querySelector('.film-error');
  let pendingTime = null;

  if (navigator.connection?.saveData) {
    video.src = video.querySelector('source').src;
  }

  function updateControls() {
    const playing = !video.paused && !video.ended;
    watch.classList.toggle('playing', playing);
    watchLabel.textContent = playing ? '暂停播放' :
      video.ended ? '重播成片' : video.currentTime > 0 ? '继续播放' : '播放成片';
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
    posterButton.hidden = true;
    video.focus({ preventScroll: true });
    // Keep play() in the click handler so the film can start with sound on mobile.
    pendingTime = time;
    seekWhenReady();
    video.play().catch(updateControls);
  }

  function showScreen() {
    video.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  document.querySelectorAll('.watch, .frame[data-time]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (link === watch && !video.paused && !video.ended) {
        video.pause();
        return;
      }
      showScreen();
      playFilm(link === watch ? null : Number(link.dataset.time));
    });
  });

  video.controls = false;
  video.tabIndex = -1;
  posterButton.hidden = false;
  posterButton.addEventListener('click', () => playFilm(null));
  video.addEventListener('loadedmetadata', seekWhenReady);
  ['play', 'pause', 'ended'].forEach(name => video.addEventListener(name, updateControls));
  function showError() {
    posterButton.hidden = true;
    video.controls = true;
    video.tabIndex = 0;
    error.hidden = false;
    updateControls();
  }
  video.addEventListener('error', showError);
  // With nested sources, browsers may report an unsupported film on the last source.
  video.querySelector('source:last-of-type').addEventListener('error', showError);

  document.addEventListener('play', event => {
    if (event.target.tagName !== 'VIDEO') return;
    document.querySelectorAll('video').forEach(other => {
      if (other !== event.target && !other.paused) other.pause();
    });
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.querySelectorAll('video').forEach(item => item.pause());
  });

  const crew = document.querySelector('.crew-row');
  const crewControl = crew.querySelector('.crew-control');
  crewControl.hidden = false;
  crewControl.addEventListener('click', () => {
    const paused = crew.classList.toggle('paused');
    const label = paused ? '继续猫咪跑动' : '暂停猫咪跑动';
    crewControl.setAttribute('aria-label', label);
    crewControl.title = label;
  });
})();
