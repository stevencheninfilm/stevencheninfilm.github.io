(() => {
  const body = document.body;
  const loader = document.querySelector('.v3-loader');
  const percent = loader?.querySelector('.v3-loader-percent');
  const tiles = [...(loader?.querySelectorAll('.v3-loader-tile') || [])];
  const lead = loader?.querySelector('.v3-loader-tile--lead');
  const interfaces = [...document.querySelectorAll('.home-interface')];
  const skip = loader?.querySelector('.v3-loader-skip');
  const motion = window.StevenHomeOpening;
  if (!body.classList.contains('home-v3') || !loader || !percent) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, watchdog = 0, run = 0;
  let pageWasHidden = false, isRevealed = false;
  let openingViewport = null;

  function revealInterface() {
    if (isRevealed) return;
    isRevealed = true;
    body.classList.remove('is-v3-loading', 'is-loading');
    interfaces.forEach(element => { element.inert = false; });
  }
  function finish() {
    run++;
    cancelAnimationFrame(frame);
    clearTimeout(watchdog);
    revealInterface();
    loader.hidden = true;
    loader.dataset.phase = 'complete';
    if (document.activeElement === skip) document.querySelector('.home-header a')?.focus({ preventScroll: true });
  }
  function prepareLead() {
    const active = document.querySelector('.deck-card.is-active');
    const image = active?.querySelector('.deck-media');
    const video = active?.querySelector('.comparison-video--after') || active?.querySelector('video');
    const leadImage = lead?.querySelector('img');
    if (leadImage) leadImage.src = image?.currentSrc || image?.src || video?.poster || leadImage.src;
    const target = active?.querySelector('.comparison-frame') || active;
    const rect = target?.getBoundingClientRect();
    return rect && rect.width > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined;
  }
  function play() {
    const currentRun = ++run;
    cancelAnimationFrame(frame);
    clearTimeout(watchdog);
    isRevealed = false;
    if (preference.matches || !motion || !lead || !tiles.length) return finish();
    loader.hidden = false;
    loader.style.opacity = '1';
    percent.textContent = '0%';
    percent.hidden = true;
    percent.style.opacity = '1';
    body.classList.add('is-v3-loading');
    interfaces.forEach(element => { element.inert = true; });
    openingViewport = { width: window.innerWidth, height: window.innerHeight };
    const layout = motion.geometry(openingViewport.width, openingViewport.height, prepareLead());
    const entries = tiles.map(element => ({ element, column: Number(element.dataset.column), row: Number(element.dataset.row), lead: element === lead }));
    entries.forEach(({ element }) => {
      element.style.width = `${layout.tileWidth}px`;
      element.style.height = `${layout.tileHeight}px`;
      element.style.opacity = '0';
    });
    const images = [...loader.querySelectorAll('img')];
    // Cached images are already ready. Count actual settled images on a cold load;
    // failures also settle so one unavailable asset cannot block the homepage.
    const settled = new Set(images.filter(image => image.complete));
    images.filter(image => !settled.has(image)).forEach(image => {
      const markReady = () => { settled.add(image); };
      if (image.decode) image.decode().then(markReady, markReady);
      else {
        image.addEventListener('load', markReady, { once: true });
        image.addEventListener('error', markReady, { once: true });
      }
    });
    const started = performance.now();
    let wallStarted = settled.size === images.length ? started : null;
    let lastPercent = -1;
    loader.dataset.phase = wallStarted === null ? 'loading' : 'wall';
    // A broken/slow image can never trap a visitor behind the opening.
    watchdog = window.setTimeout(finish, 6500);
    function render(now) {
      if (currentRun !== run) return;
      if (wallStarted === null) {
        if (settled.size === images.length || now - started >= 2100) wallStarted = now;
        else {
          const value = Math.floor(settled.size / images.length * 100);
          if (value !== lastPercent) { percent.textContent = `${value}%`; lastPercent = value; }
          // Avoid flashing a progress number for a fast cache/decode response.
          percent.hidden = now - started < 120;
          frame = requestAnimationFrame(render);
          return;
        }
      }
      percent.hidden = true;
      const time = motion.timing.wallStart + now - wallStarted;
      loader.dataset.phase = time < motion.timing.zoomStart ? 'wall' : 'zoom';
      entries.forEach(({ element, column, row, lead: isLead }) => {
        const state = motion.sample(time, layout, column, row, isLead);
        element.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) scale(${state.scale.toFixed(5)})`;
        element.style.opacity = state.opacity;
        if (isLead) {
          element.style.width = `${state.width.toFixed(2)}px`;
          element.style.height = `${state.height.toFixed(2)}px`;
          element.style.borderRadius = `${Math.min(1, Math.max(0, (time - 4300) / 350)) * Math.min(17, window.innerWidth * .01)}px`;
        }
      });
      if (time >= motion.timing.reveal) {
        revealInterface();
        loader.style.opacity = String(Math.max(0, 1 - (time - motion.timing.reveal) / (motion.timing.end - motion.timing.reveal)));
      }
      if (time >= motion.timing.end) finish();
      else frame = requestAnimationFrame(render);
    }
    frame = requestAnimationFrame(render);
  }
  function blockDuringOpening(event) {
    if (!body.classList.contains('is-v3-loading') || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('.v3-loader-skip')) return;
    if (event.type === 'keydown') {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); finish(); return; }
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' '].includes(event.key)) return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  window.addEventListener('wheel', blockDuringOpening, { capture: true, passive: false });
  window.addEventListener('keydown', blockDuringOpening, true);
  window.addEventListener('pointerdown', blockDuringOpening, true);
  window.addEventListener('touchstart', blockDuringOpening, { capture: true, passive: false });
  skip?.addEventListener('click', finish);
  document.querySelector('[data-home-replay]')?.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = new URL(event.currentTarget.href, window.location.href);
    // A real navigation resets the deck as well as the opening, even from strip
    // mode or a hash link. Modified clicks retain normal new-tab behavior.
    if (destination.pathname === window.location.pathname) window.location.reload();
    else window.location.assign(destination.href);
  });
  window.addEventListener('resize', () => {
    if (!loader.hidden && openingViewport &&
        (window.innerWidth !== openingViewport.width || window.innerHeight !== openingViewport.height)) finish();
  });
  window.addEventListener('pagehide', () => { pageWasHidden = true; run++; cancelAnimationFrame(frame); clearTimeout(watchdog); });
  window.addEventListener('pageshow', event => { if (pageWasHidden || event.persisted) { pageWasHidden = false; play(); } });
  preference.addEventListener('change', event => { if (event.matches) finish(); });
  play();
})();
