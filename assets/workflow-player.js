(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 680px)');
  const time = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;

  document.querySelectorAll('[data-workflow-player]').forEach(player => {
    const video = player.querySelector('video');
    const controls = player.querySelector('[data-player-controls]');
    const toggle = player.querySelector('[data-player-toggle]');
    const seek = player.querySelector('[data-player-seek]');
    const clock = player.querySelector('[data-player-time]');
    const sound = player.querySelector('[data-player-sound]');
    const status = player.querySelector('[data-player-status]');
    const card = player.closest('.deck-card');
    const deck = player.closest('.project-deck');
    const panel = player.closest('[data-workflow-item]');
    let visible = false, wasActive = false, loaded = false, paused = false;
    let manual = false, scrubbing = false, resume = false, failed = false;
    const active = () => visible && !document.hidden &&
      (!card || (card.classList.contains('is-active') && !deck.classList.contains('is-strip'))) &&
      (!panel || panel.getAttribute('aria-hidden') !== 'true');
    const canPlay = () => active() && !paused && !scrubbing && (!motion.matches || manual);
    const draw = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const percentage = duration ? Math.min(100, video.currentTime / duration * 100) : 0;
      if (!scrubbing) seek.value = percentage;
      seek.style.setProperty('--seek', `${scrubbing ? seek.value : percentage}%`);
      seek.disabled = !duration;
      seek.setAttribute('aria-valuetext', `${time(video.currentTime)} of ${time(duration)}`);
      clock.textContent = `${time(video.currentTime)} / ${time(duration)}`;
      toggle.textContent = failed ? 'Retry' : video.paused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-label', `${failed ? 'Retry' : video.paused ? 'Play' : 'Pause'} video`);
      sound.textContent = video.muted ? 'Sound off' : 'Sound on';
      sound.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
      sound.setAttribute('aria-pressed', String(!video.muted));
    };
    const play = () => {
      if (!canPlay()) return;
      video.play().then(() => { if (!canPlay()) video.pause(); }).catch(() => {
        if (canPlay()) { paused = true; status.textContent = 'Press Play to start the film.'; draw(); }
      });
    };
    const load = () => {
      if (loaded) return;
      loaded = true;
      video.src = mobile.matches && video.dataset.srcMobile ? video.dataset.srcMobile : video.dataset.src;
      video.load();
    };
    const update = () => {
      const isActive = active();
      if (isActive && !wasActive) paused = false;
      wasActive = isActive;
      controls.inert = !isActive;
      if (canPlay() && !failed) { load(); play(); }
      else video.pause();
      draw();
    };
    controls.hidden = false;
    // Keep range drags and keyboard seeking inside the player, not the homepage deck.
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'keydown', 'keyup', 'wheel']) {
      controls.addEventListener(event, e => e.stopPropagation());
    }
    toggle.addEventListener('click', () => {
      if (failed) { failed = false; loaded = false; paused = false; }
      else paused = !video.paused;
      manual = true;
      status.textContent = '';
      update();
    });
    sound.addEventListener('click', () => { video.muted = !video.muted; draw(); });
    const beginSeek = () => {
      if (seek.disabled || scrubbing) return;
      resume = !video.paused;
      scrubbing = true;
      video.pause();
    };
    const endSeek = () => {
      if (!scrubbing) return;
      scrubbing = false;
      if (resume && canPlay()) play();
      draw();
    };
    seek.addEventListener('pointerdown', event => {
      beginSeek();
      if (scrubbing) seek.setPointerCapture(event.pointerId);
    });
    seek.addEventListener('input', () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(video.duration - .04, Math.max(0, Number(seek.value) / 100 * video.duration));
      }
      draw();
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'change', 'blur']) seek.addEventListener(event, endSeek);
    for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'volumechange']) video.addEventListener(event, draw);
    video.addEventListener('canplay', () => { status.textContent = ''; play(); });
    video.addEventListener('error', () => {
      failed = true; video.pause(); status.textContent = 'Video unavailable. Select Retry to load it again.'; draw();
    });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting; update();
    }, { threshold: .1 }).observe(player);
    else visible = true;
    const observer = new MutationObserver(update);
    for (const element of [card, deck, panel].filter(Boolean)) observer.observe(element, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pagehide', () => video.pause());
    window.addEventListener('pageshow', update);
    motion.addEventListener('change', () => { manual = false; update(); });
    update();
  });
})();
