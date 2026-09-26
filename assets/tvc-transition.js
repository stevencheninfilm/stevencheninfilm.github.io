(() => {
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'steven-tvc-transition-v1';
  const artworkURL = new URL('images/tvc/banner-editorial-20260925.webp', document.currentScript.src).href;
  let pending = null;
  let incoming = null;
  let arrival = null;
  let fallbackStarted = false;
  let imageWaitStarted = false;
  let fallbackTimer;
  const viewport = { width: innerWidth, height: innerHeight };
  const forget = () => { try { sessionStorage.removeItem(storageKey); } catch {} };
  const clearFallback = () => {
    clearTimeout(fallbackTimer);
    root.classList.remove('tvc-fallback-pending', 'tvc-fallback-running');
    arrival = null;
    fallbackStarted = false;
  };
  const clear = () => {
    pending = null;
    root.classList.remove('tvc-transition-out', 'tvc-transition-in');
  };
  const activeArtwork = () => document.querySelector(
    '.project-deck:not(.is-strip) .deck-card--tvc.is-active .deck-media--tvc-banner'
  );
  const readyImage = image => image?.complete && image.naturalWidth > 0;

  // A one-use geometry handoff also covers browsers that abort a native
  // transition on repeat visits. Store only the destination and numeric bounds,
  // never document markup or an arbitrary image URL.
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved && saved.to === location.href) {
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
        root.style.setProperty('--tvc-artwork-url', `url("${artworkURL}")`);
        root.classList.add('tvc-fallback-pending');
        // A slow/missing resource must never trap the user behind the handoff.
        fallbackTimer = setTimeout(clearFallback, 3000);
      }
    }
  } catch { /* Storage may be unavailable in private or local-file contexts. */ }

  const startFallback = () => {
    if (!arrival || incoming || fallbackStarted) return;
    const image = document.querySelector('.tvc-page .tvc-banner > img');
    if (preference.matches || !image || (image.complete && !image.naturalWidth)) { clearFallback(); return; }
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
    root.style.setProperty('--tvc-to-transform', `matrix(${rect.width / arrival.width}, 0, 0, ${rect.height / arrival.height}, ${rect.x - arrival.x}, ${rect.y - arrival.y})`);
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

  // Observe native links without intercepting navigation, history, or new tabs.
  document.addEventListener('click', event => {
    pending = null;
    forget();
    const primaryActivation = event.button === 0 || (event.button === -1 && event.detail === 0);
    if (event.defaultPrevented || !primaryActivation || event.metaKey ||
        event.ctrlKey || event.shiftKey || event.altKey || preference.matches) return;
    const link = event.target.closest?.('.deck-card--tvc a[href]');
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || !destination.pathname.endsWith('/tvc/index.html') ||
        destination.hash || !readyImage(activeArtwork())) return;
    pending = { href: destination.href, at: Date.now() };
    const { x, y, width, height } = activeArtwork().getBoundingClientRect();
    try { sessionStorage.setItem(storageKey, JSON.stringify({ to: pending.href, at: pending.at, x, y, width, height })); } catch {}
  });

  window.addEventListener('pageswap', event => {
    const transition = event.viewTransition;
    if (!transition) return;
    // activation is not available in older Safari versions; the native click
    // remains authoritative there. Do not animate unrelated/history navigation.
    const destination = event.activation?.entry?.url;
    if (preference.matches || !pending || Date.now() - pending.at > 5000 ||
        (destination && destination !== pending.href) || !readyImage(activeArtwork())) {
      transition.skipTransition();
      return;
    }
    root.classList.add('tvc-transition-out');
    transition.finished.then(clear, clear);
  });

  // This listener must be registered by a parser-blocking head script, before
  // the destination's first render. It also handles reactivation from BFCache.
  window.addEventListener('pagereveal', event => {
    const transition = event.viewTransition;
    if (!transition) { afterDOM(); return; }
    const artwork = document.querySelector('.tvc-page .tvc-banner > img');
    if (preference.matches || !readyImage(artwork)) {
      transition.skipTransition();
      clear();
      if (preference.matches) clearFallback();
      else afterDOM();
      return;
    }
    incoming = transition;
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
