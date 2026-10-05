(() => {
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  // The original TVC transition is shared by these explicitly supported routes.
  const storageKey = 'steven-project-transition-v2';
  const scriptURL = document.currentScript.src;
  const routes = [
    { id: 'tvc', to: '../tvc/index.html', image: 'images/tvc/banner-editorial-20260925.webp', target: '.tvc-page .tvc-banner > img' },
    { id: 'alone', to: '../film/Film.html#alone', image: 'images/home/alone-poster-20260925.webp', target: '.film-page #project-dialog[open][data-project="alone"] #dialog-hero' },
    { id: 'healing', to: '../film/Film.html#healing', image: '../film/images/healing_cover.jpg', target: '.film-page #project-dialog[open][data-project="healing"] #dialog-hero' }
  ];
  const routeFor = url => routes.find(route => {
    const destination = new URL(route.to, scriptURL);
    return destination.origin === url.origin && destination.pathname === url.pathname && destination.hash === url.hash;
  });
  const destinationRoute = routeFor(new URL(location.href));
  const artworkURL = route => new URL(route.image, scriptURL).href;
  // Load only the selected film hero before film.js opens its hash-driven modal.
  if (destinationRoute && destinationRoute.id !== 'tvc') {
    const preload = document.createElement('link');
    preload.rel = 'preload'; preload.as = 'image'; preload.href = artworkURL(destinationRoute);
    document.head.appendChild(preload);
  }
  let pending = null;
  let incoming = null;
  let arrival = null;
  let fallbackStarted = false;
  let imageWaitStarted = false;
  let fallbackTimer;
  let capturedArtwork = null;
  const viewport = { width: innerWidth, height: innerHeight };
  const forget = () => { try { sessionStorage.removeItem(storageKey); } catch {} };
  const clearFallback = () => {
    clearTimeout(fallbackTimer);
    root.classList.remove('tvc-fallback-pending', 'tvc-fallback-running', 'tvc-fallback-film');
    arrival = null;
    fallbackStarted = false;
  };
  const clear = () => {
    pending = null;
    root.classList.remove('tvc-transition-out', 'tvc-transition-in');
    capturedArtwork?.removeAttribute('data-shared-artwork');
    capturedArtwork = null;
  };
  const activeArtwork = route => route && document.querySelector(
    `.project-deck:not(.is-strip) .deck-card.is-active[data-shared-project="${route.id}"] .deck-picture > img`
  );
  const targetArtwork = () => destinationRoute && document.querySelector(destinationRoute.target);
  const capture = image => { capturedArtwork = image; image.setAttribute('data-shared-artwork', ''); };
  const readyImage = image => image?.complete && image.naturalWidth > 0;

  // A one-use geometry handoff also covers browsers that abort a native
  // transition on repeat visits. Store only the destination and numeric bounds,
  // never document markup or an arbitrary image URL.
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved && saved.to === location.href && destinationRoute) {
      forget();
      const { x, y, width, height } = saved;
      if (!preference.matches && Date.now() - saved.at < 5000 && Date.now() >= saved.at &&
          [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0 &&
          width < innerWidth * 2 && height < innerHeight * 2) {
        arrival = saved;
        root.style.setProperty('--tvc-from-x', `${x}px`);
        root.style.setProperty('--tvc-from-y', `${y}px`);
        root.style.setProperty('--tvc-from-width', `${width}px`);
        root.style.setProperty('--tvc-from-height', `${height}px`);
        root.style.setProperty('--tvc-artwork-url', `url("${artworkURL(destinationRoute)}")`);
        root.classList.add('tvc-fallback-pending');
        if (destinationRoute.id !== 'tvc') root.classList.add('tvc-fallback-film');
        // A slow/missing resource must never trap the user behind the handoff.
        fallbackTimer = setTimeout(clearFallback, 3000);
      }
    }
  } catch { /* Storage may be unavailable in private or local-file contexts. */ }

  const startFallback = () => {
    if (!arrival || incoming || fallbackStarted) return;
    const image = targetArtwork();
    // The film modal is populated by film.js. Its ready event retries this path.
    if (!image) return;
    if (preference.matches || (image.complete && !image.naturalWidth)) { clearFallback(); return; }
    if (!readyImage(image)) {
      if (!imageWaitStarted) {
        imageWaitStarted = true;
        image.addEventListener('load', startFallback, { once: true });
        image.addEventListener('error', clearFallback, { once: true });
      }
      return;
    }
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) { clearFallback(); return; }
    fallbackStarted = true;
    root.style.setProperty('--tvc-to-x', `${rect.x}px`);
    root.style.setProperty('--tvc-to-y', `${rect.y}px`);
    root.style.setProperty('--tvc-to-width', `${rect.width}px`);
    root.style.setProperty('--tvc-to-height', `${rect.height}px`);
    // Commit the starting image before motion, even on a warm cache.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!arrival) return;
      root.classList.add('tvc-fallback-running');
      clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(clearFallback, 1100);
    }));
  };
  const afterDOM = () => requestAnimationFrame(startFallback);
  document.addEventListener('DOMContentLoaded', afterDOM, { once: true });
  window.addEventListener('load', afterDOM, { once: true });
  document.addEventListener('portfolio:project-ready', afterDOM);
  document.addEventListener('portfolio:project-closed', () => { incoming?.skipTransition(); clear(); clearFallback(); });

  // Observe native links without intercepting navigation, history, or new tabs.
  document.addEventListener('click', event => {
    pending = null;
    forget();
    const primaryActivation = event.button === 0 || (event.button === -1 && event.detail === 0);
    if (event.defaultPrevented || !primaryActivation || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey || preference.matches) return;
    const link = event.target.closest?.('.deck-card[data-shared-project] a[href]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const destination = new URL(link.href, location.href);
    const route = routeFor(destination);
    if (!route || destination.origin !== location.origin || !readyImage(activeArtwork(route))) return;
    pending = { href: destination.href, at: Date.now(), route };
    const { x, y, width, height } = activeArtwork(route).getBoundingClientRect();
    try { sessionStorage.setItem(storageKey, JSON.stringify({ to: pending.href, at: pending.at, x, y, width, height })); } catch {}
  });

  window.addEventListener('pageswap', event => {
    const transition = event.viewTransition;
    if (!transition) return;
    // activation is not available in older Safari versions; the native click
    // remains authoritative there. Do not animate unrelated/history navigation.
    const destination = event.activation?.entry?.url;
    if (preference.matches || !pending || Date.now() - pending.at > 5000 ||
        (destination && destination !== pending.href) || !readyImage(activeArtwork(pending.route))) {
      transition.skipTransition();
      return;
    }
    capture(activeArtwork(pending.route));
    root.classList.add('tvc-transition-out');
    transition.finished.then(clear, clear);
  });

  // This listener must be registered by a parser-blocking head script, before
  // the destination's first render. It also handles reactivation from BFCache.
  window.addEventListener('pagereveal', event => {
    const transition = event.viewTransition;
    if (!transition) { afterDOM(); return; }
    const artwork = targetArtwork();
    if (preference.matches || !readyImage(artwork)) {
      transition.skipTransition();
      clear();
      if (preference.matches) clearFallback();
      else afterDOM();
      return;
    }
    incoming = transition;
    capture(artwork);
    // Remove the fallback veil before native snapshots are taken.
    root.classList.remove('tvc-fallback-pending', 'tvc-fallback-running');
    root.classList.add('tvc-transition-in');
    let nativeReady = false;
    transition.ready.then(() => {
      nativeReady = true;
      clearFallback();
    }, () => {
      incoming = null;
      clear();
      if (arrival) root.classList.add('tvc-fallback-pending');
      startFallback();
    });
    transition.finished.then(() => { if (nativeReady) { incoming = null; clear(); } }, clear);
  });

  window.addEventListener('pageshow', event => { if (event.persisted && !incoming) clear(); });
  preference.addEventListener('change', event => {
    if (event.matches) { incoming?.skipTransition(); clear(); clearFallback(); }
  });
  // User input or a resized viewport takes priority over the animated landing.
  window.addEventListener('resize', () => {
    if (arrival && (innerWidth !== viewport.width || innerHeight !== viewport.height)) clearFallback();
  }, { passive: true });
  for (const type of ['wheel', 'touchstart', 'keydown', 'pagehide']) {
    window.addEventListener(type, () => { if (arrival) clearFallback(); }, { passive: true });
  }
})();
