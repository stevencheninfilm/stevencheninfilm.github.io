(() => {
  const body = document.body;
  const loader = document.querySelector('.v3-loader');
  const percent = document.querySelector('.v3-loader-percent');
  if (!body.classList.contains('home-v3') || !loader || !percent) return;

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let loaderRun = 0;
  let pageWasHidden = false;

  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const isCurrentRun = (run) => run === loaderRun && !motionPreference.matches;

  const resumeActiveVideo = () => {
    const video = document.querySelector('.deck-card.is-active:not(.deck-card--comparison) video');
    if (video) video.play().catch(() => {});
  };

  const revealImmediately = () => {
    loaderRun += 1;
    body.classList.remove('is-v3-loading');
    loader.hidden = true;
    loader.classList.remove('is-counted', 'is-row', 'is-mosaic', 'is-opening', 'is-finished');
    resumeActiveVideo();
  };

  const resetLoader = () => {
    loader.hidden = false;
    loader.classList.remove('is-counted', 'is-row', 'is-mosaic', 'is-opening', 'is-finished');
    percent.textContent = '0%';
    body.classList.add('is-v3-loading');
    void loader.offsetWidth;
  };

  const animatePercent = (run, duration) => new Promise((resolve) => {
    const started = performance.now();
    let lastValue = -1;
    const count = (now) => {
      if (!isCurrentRun(run)) {
        resolve();
        return;
      }
      const progress = Math.min(1, (now - started) / duration);
      const value = Math.min(100, Math.floor(progress * 25) * 4);
      if (value !== lastValue) {
        percent.textContent = `${value}%`;
        lastValue = value;
      }
      if (progress < 1) requestAnimationFrame(count);
      else resolve();
    };
    requestAnimationFrame(count);
  });

  const playLoader = async () => {
    const run = ++loaderRun;
    resetLoader();

    if (motionPreference.matches) {
      revealImmediately();
      return;
    }

    const countFinished = animatePercent(run, 1150);
    await wait(1000);
    if (!isCurrentRun(run)) return;

    loader.classList.add('is-row');
    await countFinished;
    if (!isCurrentRun(run)) return;
    loader.classList.add('is-counted');
    await wait(350);
    if (!isCurrentRun(run)) return;

    loader.classList.add('is-mosaic');
    await wait(1200);
    if (!isCurrentRun(run)) return;

    await wait(450);
    if (!isCurrentRun(run)) return;

    loader.classList.add('is-opening');
    await wait(250);
    if (!isCurrentRun(run)) return;

    body.classList.remove('is-v3-loading');
    loader.classList.add('is-finished');
    resumeActiveVideo();
    await wait(680);
    if (run === loaderRun) loader.hidden = true;
  };

  const blockWhileLoading = (event) => {
    if (!body.classList.contains('is-v3-loading')) return;
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  window.addEventListener('wheel', blockWhileLoading, { capture: true, passive: false });
  window.addEventListener('keydown', blockWhileLoading, true);
  window.addEventListener('pointerdown', blockWhileLoading, true);
  window.addEventListener('touchstart', blockWhileLoading, { capture: true, passive: false });

  window.addEventListener('pagehide', () => {
    loaderRun += 1;
    pageWasHidden = true;
  });

  window.addEventListener('pageshow', (event) => {
    if (!pageWasHidden && !event.persisted) return;
    pageWasHidden = false;
    playLoader();
  });

  motionPreference.addEventListener('change', (event) => {
    if (event.matches) revealImmediately();
  });

  playLoader();
})();
