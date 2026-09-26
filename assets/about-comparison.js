(() => {
  const stage = document.querySelector('[data-about-comparison]');
  if (!stage) return;
  const frame = stage.querySelector('.ab-compare__frame');
  const handle = stage.querySelector('.ab-compare__handle');
  const toggle = stage.querySelector('.ab-compare__play');
  const status = stage.querySelector('.ab-compare__status');
  const before = stage.querySelector('.ab-compare__before');
  const after = stage.querySelector('.ab-compare__after video');
  if (!frame || !handle || !toggle || !status || !before || !after) return;

  const videos = [before, after];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = window.matchMedia('(max-width: 600px)');
  let split = 50, pointer = null, inView = false, paused = false;
  let manualPlay = false, ready = false, loading = false, failed = false;
  let generation = 0, playPending = false, frameRequest = null, loadTimer = null;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const shouldPlay = () => inView && !document.hidden && !paused && (!motion.matches || manualPlay);

  const setSplit = (value) => {
    split = clamp(value, 4, 96);
    stage.style.setProperty('--compare-split', `${split}%`);
    const rounded = Math.round(split);
    handle.setAttribute('aria-valuenow', String(rounded));
    handle.setAttribute('aria-valuetext', `${rounded} percent 3D previs, ${100 - rounded} percent AI render`);
  };
  const sync = (force = false) => {
    if (before.readyState < 1 || after.readyState < 1 || before.seeking) return;
    if (force || Math.abs(before.currentTime - after.currentTime) > .055) {
      before.currentTime = Math.min(after.currentTime, Math.max(0, before.duration - .04));
    }
  };
  const stop = () => {
    if (frameRequest !== null && after.cancelVideoFrameCallback) after.cancelVideoFrameCallback(frameRequest);
    frameRequest = null;
    videos.forEach(video => video.pause());
  };
  const track = () => {
    if (!after.requestVideoFrameCallback || frameRequest !== null) return;
    const tick = () => {
      frameRequest = null;
      if (!shouldPlay() || after.paused) return;
      sync();
      frameRequest = after.requestVideoFrameCallback(tick);
    };
    frameRequest = after.requestVideoFrameCallback(tick);
  };
  const showError = () => {
    ++generation;
    clearTimeout(loadTimer);
    loading = false; ready = false; failed = true; playPending = false;
    stop();
    toggle.textContent = 'Retry comparison';
    status.textContent = 'Video unavailable. Retry to load both views.';
  };
  const play = async () => {
    if (playPending || !ready || !shouldPlay()) return;
    playPending = true;
    const run = generation;
    sync(true);
    const results = await Promise.allSettled(videos.map(video => video.play()));
    if (run !== generation) return;
    playPending = false;
    if (!shouldPlay()) { stop(); return; }
    if (results.some(result => result.status === 'rejected')) {
      paused = true;
      stop();
      toggle.textContent = 'Play comparison';
      status.textContent = 'Press Play to start both views.';
      return;
    }
    status.textContent = '';
    toggle.textContent = 'Pause comparison';
    track();
  };
  const checkReady = () => {
    if (!loading || !videos.every(video => video.readyState >= 3 && !video.seeking)) return;
    loading = false; ready = true;
    clearTimeout(loadTimer);
    status.textContent = '';
    update();
  };
  const load = () => {
    loading = true; failed = false;
    status.textContent = 'Loading both views…';
    // Same opening frame and source pair as the homepage, decoded natively.
    videos.forEach(video => {
      video.muted = true;
      video.src = mobile.matches ? video.dataset.srcMobile : video.dataset.src;
      video.load();
    });
    loadTimer = setTimeout(showError, 25000);
  };
  function update() {
    if (failed) return;
    if (!shouldPlay()) {
      stop();
      toggle.textContent = 'Play comparison';
      return;
    }
    toggle.textContent = 'Pause comparison';
    if (!ready && !loading) load();
    if (ready) play();
  }
  videos.forEach(video => {
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(5.25, Math.max(0, video.duration - .08));
    });
    video.addEventListener('canplay', checkReady);
    video.addEventListener('seeked', checkReady);
    video.addEventListener('error', showError);
  });
  after.addEventListener('timeupdate', () => sync());
  after.addEventListener('seeked', () => sync(true));
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    if (failed) { failed = false; paused = false; manualPlay = true; }
    else { paused = shouldPlay(); manualPlay = !paused; }
    update();
  });

  const pointerSplit = (event) => {
    const rect = frame.getBoundingClientRect();
    if (rect.width) setSplit((event.clientX - rect.left) / rect.width * 100);
  };
  frame.addEventListener('pointerdown', event => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    // Touch can still scroll the page outside the handle.
    if (event.pointerType === 'touch' && !event.target.closest('.ab-compare__handle')) return;
    event.preventDefault();
    pointer = event.pointerId;
    pointerSplit(event);
    frame.setPointerCapture(pointer);
  });
  frame.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault(); pointerSplit(event);
  });
  const endPointer = event => {
    if (event.pointerId !== pointer) return;
    if (frame.hasPointerCapture(pointer)) frame.releasePointerCapture(pointer);
    pointer = null;
  };
  frame.addEventListener('pointerup', endPointer);
  frame.addEventListener('pointercancel', endPointer);
  frame.addEventListener('lostpointercapture', () => { pointer = null; });
  handle.addEventListener('keydown', event => {
    const steps = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10, Home: 4 - split, End: 96 - split };
    if (!(event.key in steps)) return;
    event.preventDefault(); setSplit(split + steps[event.key]);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      const visible = entries[0].isIntersecting;
      // A pause applies to this visit only. Returning to the section starts
      // both muted views again without another click.
      if (visible && !inView) paused = false;
      inView = visible;
      update();
    }, { threshold: 0 }).observe(frame);
  } else { inView = true; }
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', update);
  motion.addEventListener('change', () => { manualPlay = false; update(); });
  setSplit(split);
  update();
})();
