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
  const compactScreen = window.matchMedia('(max-width: 700px)');
  const touchScreen = window.matchMedia('(pointer: coarse)');
  const images = [...loader.querySelectorAll('img')];
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
    if (loader.dataset.phase === 'loading') {
      images.forEach(image => {
        if (!image.complete && image.dataset.src) image.removeAttribute('src');
      });
    }
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
    const pictureRect = active?.querySelector('.comparison-visual')?.getBoundingClientRect();
    const target = active?.querySelector('.comparison-frame') || active;
    const rect = pictureRect?.width > 0 ? pictureRect : target?.getBoundingClientRect();
    return rect && rect.width > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined;
  }
  function play() {
    const currentRun = ++run;
    cancelAnimationFrame(frame);
    clearTimeout(watchdog);
    isRevealed = false;
    loader.hidden = true;
    body.classList.remove('is-v3-loading', 'is-loading');
    interfaces.forEach(element => { element.inert = false; });
    // Navigation is available even if this optional script arrives late. Avoid
    // blocking data saver or reduced-motion visits with decorative downloads.
    const connection = navigator.connection;
    const compact = compactScreen.matches || touchScreen.matches;
    if (preference.matches || !motion || !lead || !tiles.length ||
        (!compact && performance.now() > 1800) || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return finish();
    // Phones reuse small dock/poster images in three columns rather than fetching the full
    // desktop wall. The remaining tiles stay dormant even on the first visit.
    const activeTiles = tiles.filter(element => {
      element.hidden = compact && Math.abs(Number(element.dataset.column)) > 1;
      return !element.hidden;
    });
    const activeImages = activeTiles.map(element => element.querySelector('img'));
    activeImages.forEach(image => {
      const source = compact && image.dataset.srcMobile ? image.dataset.srcMobile : image.dataset.src;
      if (source && image.getAttribute('src') !== source) image.src = source;
    });
    loader.style.opacity = '1';
    percent.textContent = '0%';
    percent.hidden = true;
    percent.style.opacity = '1';
    openingViewport = { width: window.innerWidth, height: window.innerHeight };
    const layout = motion.geometry(openingViewport.width, openingViewport.height, prepareLead());
    const entries = activeTiles.map(element => ({ element, image: element.querySelector('img'), column: Number(element.dataset.column), row: Number(element.dataset.row), lead: element === lead }));
    entries.forEach(({ element }) => {
      element.style.width = `${layout.tileWidth}px`;
      element.style.height = `${layout.tileHeight}px`;
      element.style.opacity = '0';
    });
    // Count actual ready images on a cold load. A failure skips the optional
    // animation so an unavailable asset cannot block the homepage.
    const requiredImages = compact ? [lead.querySelector('img')] : activeImages;
    let failed = requiredImages.some(image => image.complete && image.naturalWidth === 0);
    const settled = new Set(activeImages.filter(image => image.complete));
    activeImages.filter(image => !settled.has(image)).forEach(image => {
      const markReady = () => { settled.add(image); };
      const markFailed = () => { if (requiredImages.includes(image)) failed = true; markReady(); };
      if (image.decode) image.decode().then(markReady, markFailed);
      else {
        image.addEventListener('load', markReady, { once: true });
        image.addEventListener('error', markFailed, { once: true });
      }
    });
    const wallReady = () => requiredImages.every(image => settled.has(image) && image.naturalWidth > 0);
    const started = performance.now();
    const readinessBudget = compact ? 1800 : 700;
    let wallStarted = wallReady() ? started : null;
    let wallVisible = false;
    let lastPercent = -1;
    loader.dataset.phase = wallStarted === null ? 'loading' : 'wall';
    // A broken/slow image can never trap a visitor behind the opening.
    watchdog = window.setTimeout(finish, 6500);
    function render(now) {
      if (currentRun !== run) return;
      if (failed) return finish();
      if (wallStarted === null) {
        if (wallReady()) wallStarted = now;
        else if (now - started >= readinessBudget) return finish();
        else {
          const value = Math.floor(requiredImages.filter(image => settled.has(image)).length / requiredImages.length * 100);
          if (value !== lastPercent) { percent.textContent = `${value}%`; lastPercent = value; }
          // Keep the already-rendered homepage usable while optional wall art
          // decodes. Never replace a slow first visit with a loading screen.
          percent.hidden = true;
          frame = requestAnimationFrame(render);
          return;
        }
      }
      if (!wallVisible) {
        wallVisible = true;
        loader.hidden = false;
        body.classList.add('is-v3-loading');
        interfaces.forEach(element => { element.inert = true; });
      }
      percent.hidden = true;
      const time = motion.timing.wallStart + now - wallStarted;
      loader.dataset.phase = time < motion.timing.zoomStart ? 'wall' : 'zoom';
      entries.forEach(({ element, image, column, row, lead: isLead }) => {
        const state = motion.sample(time, layout, column, row, isLead);
        element.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) scale(${state.scale.toFixed(5)})`;
        element.style.opacity = image.complete && image.naturalWidth > 0 ? state.opacity : 0;
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
    // Once a visitor starts using the already-visible page, an optional late
    // image wall must not cover their selection or navigation.
    if (loader.dataset.phase === 'loading' && !body.classList.contains('is-v3-loading')) {
      finish();
      return;
    }
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
  document.querySelectorAll('[data-home-replay]').forEach(link => link.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = new URL(event.currentTarget.href, window.location.href);
    // A real navigation resets the deck as well as the opening, even from strip
    // mode or a hash link. Modified clicks retain normal new-tab behavior.
    if (destination.pathname === window.location.pathname && destination.search === window.location.search) window.location.reload();
    else window.location.assign(destination.href);
  }));
  window.addEventListener('resize', () => {
    if (loader.dataset.phase !== 'complete' && openingViewport &&
        (window.innerWidth !== openingViewport.width ||
          (!(compactScreen.matches || touchScreen.matches) && window.innerHeight !== openingViewport.height))) finish();
  });
  window.addEventListener('pagehide', () => { pageWasHidden = true; run++; cancelAnimationFrame(frame); clearTimeout(watchdog); });
  window.addEventListener('pageshow', event => { if (pageWasHidden || event.persisted) { pageWasHidden = false; play(); } });
  preference.addEventListener('change', event => { if (event.matches) finish(); });
  play();
})();
