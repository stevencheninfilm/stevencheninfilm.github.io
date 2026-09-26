(() => {
  const deck = document.querySelector('.project-deck');
  if (!deck) return;

  const cards = [...document.querySelectorAll('.deck-card')];
  const thumbnails = [...document.querySelectorAll('[data-slide]')];
  const current = document.querySelector('#current-slide');
  const pagination = document.querySelector('.home-pagination');
  const stageSteps = [...document.querySelectorAll('.stage-step')];
  const thumbnailDock = document.querySelector('.thumbnail-dock');
  const loader = document.querySelector('.site-loader');
  const loaderPercent = document.querySelector('.loader-percent');
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionPreference.matches;
  const total = cards.length;
  let active = 0;
  let mode = 'expanded';
  let locked = true;
  let pointerStart = null;
  let pointerStartTarget = 0;
  let pointerStartY = null;
  let pointerStartCard = null;
  let pointerTravel = 0;
  let suppressCardClickUntil = 0;
  let wheelIntent = 0;
  let wheelReady = true;
  let wheelRelease = null;
  let stripProgress = 0;
  let stripTarget = 0;
  let stripFrame = null;
  let stripFrameTime = 0;
  let stripSettle = null;
  let stripGestureStart = 0;
  let stripGestureDirection = 0;
  let stripGestureActive = false;
  let resizeFrame = null;

  const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const cardAtPoint = (x, y) => cards.find((card) => {
    const rect = card.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }) || null;

  const syncThumbnailGeometry = () => {
    const geometry = thumbnails.map((thumbnail) => thumbnail.getBoundingClientRect());
    geometry.forEach((rect, index) => {
      cards[index].style.setProperty('--thumb-left', `${rect.left}px`);
      cards[index].style.setProperty('--thumb-top', `${rect.top}px`);
      cards[index].style.setProperty('--thumb-width', `${rect.width}px`);
      cards[index].style.setProperty('--thumb-height', `${rect.height}px`);
    });
  };

  const stripMetrics = () => {
    const cardWidth = clamp((window.innerWidth * .18) + 88, 188, 440);
    const gap = clamp(window.innerWidth * .018, 18, 32);
    return { cardWidth, distance: cardWidth + gap };
  };

  const ensureCardMedia = (index) => {
    const card = cards[index];
    if (!card || card.dataset.mediaLoaded === 'true') return Promise.resolve();

    const video = card.querySelector('video');
    if (video) {
      if (video.dataset.src) {
        video.src = video.dataset.src;
        video.removeAttribute('data-src');
        video.load();
      }
      card.dataset.mediaLoaded = 'true';
      return Promise.resolve();
    }

    const image = card.querySelector('img[data-src]');
    card.querySelectorAll('source[data-srcset]').forEach((source) => {
      source.srcset = source.dataset.srcset;
      source.removeAttribute('data-srcset');
    });
    if (image) {
      image.src = image.dataset.src;
      image.removeAttribute('data-src');
    }
    card.dataset.mediaLoaded = 'true';
    return image?.decode ? image.decode().catch(() => {}) : Promise.resolve();
  };

  cards[0].dataset.mediaLoaded = 'true';

  const renderStrip = (progress = stripProgress) => {
    const { cardWidth, distance } = stripMetrics();
    cards.forEach((card, index) => {
      const relative = index - progress;
      const x = relative * distance;
      const cardCenter = (window.innerWidth / 2) + x;
      const visible = cardCenter > -cardWidth && cardCenter < window.innerWidth + cardWidth;
      card.style.setProperty('--rel', relative);
      card.style.setProperty('--strip-x', `${x}px`);
      card.style.setProperty('--strip-opacity', visible ? '1' : '0');
    });
  };

  const updateInterface = () => {
    cards.forEach((card, index) => {
      const selected = index === active;
      const projectLinks = card.querySelectorAll('.deck-project-link, .tvc-image-link');
      card.classList.toggle('is-active', selected);
      card.classList.toggle('is-strip-selected', selected && mode === 'strip');
      card.tabIndex = mode === 'strip' && selected ? 0 : -1;
      if (mode === 'expanded' && !selected) card.setAttribute('aria-hidden', 'true');
      else card.removeAttribute('aria-hidden');
      if (mode === 'strip') {
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Open ${card.dataset.title}`);
      } else {
        card.removeAttribute('role');
        card.removeAttribute('aria-label');
      }
      projectLinks.forEach((projectLink) => {
        projectLink.tabIndex = mode === 'expanded' && selected ? 0 : -1;
        if (mode === 'strip') projectLink.setAttribute('aria-hidden', 'true');
        else projectLink.removeAttribute('aria-hidden');
      });
    });
    thumbnails.forEach((thumbnail, index) => {
      const selected = index === active;
      thumbnail.classList.toggle('is-active', selected);
      thumbnail.setAttribute('aria-pressed', String(selected));
      thumbnail.tabIndex = mode === 'expanded' ? 0 : -1;
    });
    stageSteps.forEach((step) => {
      step.tabIndex = mode === 'expanded' ? 0 : -1;
      if (mode === 'strip') step.setAttribute('aria-hidden', 'true');
      else step.removeAttribute('aria-hidden');
    });
    if (mode === 'strip') thumbnailDock.setAttribute('aria-hidden', 'true');
    else thumbnailDock.removeAttribute('aria-hidden');
    current.textContent = cards[active]?.dataset.page ?? String(active + 1);
    pagination.setAttribute('aria-label', mode === 'strip' ? `Open ${cards[active].dataset.title}` : `Browse all ${total} projects`);

    cards.forEach((card, index) => {
      if (card.classList.contains('deck-card--comparison')) return;
      const video = card.querySelector('video');
      if (!video) return;
      if (index === active && mode === 'expanded') {
        ensureCardMedia(index).then(() => video.play().catch(() => {}));
      } else video.pause();
    });

    const selectedThumb = thumbnails[active];
    if (selectedThumb && mode === 'expanded') selectedThumb.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
  };

  const selectNearestStripCard = () => {
    const nearest = clamp(Math.round(stripProgress), 0, total - 1);
    if (nearest === active) return;
    active = nearest;
    updateInterface();
  };

  const animateStrip = (now) => {
    if (mode !== 'strip') {
      stripFrame = null;
      return;
    }
    const elapsed = stripFrameTime ? clamp(now - stripFrameTime, 8, 34) : 16;
    stripFrameTime = now;
    const difference = stripTarget - stripProgress;
    const smoothing = 1 - Math.exp(-elapsed * .0145);
    stripProgress += difference * smoothing;

    if (Math.abs(difference) < .0006) stripProgress = stripTarget;
    renderStrip(stripProgress);
    selectNearestStripCard();

    if (stripProgress !== stripTarget) stripFrame = requestAnimationFrame(animateStrip);
    else {
      stripFrame = null;
      stripFrameTime = 0;
    }
  };

  const startStripMotion = () => {
    if (reducedMotion) {
      stripProgress = stripTarget;
      renderStrip(stripProgress);
      selectNearestStripCard();
      return;
    }
    if (stripFrame === null) stripFrame = requestAnimationFrame(animateStrip);
  };

  const settleStrip = () => {
    let destination = Math.round(stripTarget);
    if (destination === stripGestureStart && stripGestureDirection !== 0) {
      destination = stripGestureStart + stripGestureDirection;
    }
    stripTarget = clamp(destination, 0, total - 1);
    stripGestureActive = false;
    startStripMotion();
  };

  const browseStrip = (delta) => {
    if (!stripGestureActive) {
      stripGestureActive = true;
      stripGestureStart = active;
      stripGestureDirection = Math.sign(delta);
    } else if (delta !== 0) stripGestureDirection = Math.sign(delta);

    const { distance } = stripMetrics();
    stripTarget = clamp(stripTarget + (delta / distance) * 1.18, 0, total - 1);
    startStripMotion();
    window.clearTimeout(stripSettle);
    stripSettle = window.setTimeout(settleStrip, 145);
  };

  const nudgeStrip = (direction) => {
    if (locked || mode !== 'strip') return;
    window.clearTimeout(stripSettle);
    stripGestureActive = false;
    stripTarget = clamp(Math.round(stripTarget) + direction, 0, total - 1);
    startStripMotion();
  };

  const collapseToStrip = async () => {
    if (locked) return;
    locked = true;
    syncThumbnailGeometry();
    stripProgress = active;
    stripTarget = active;
    renderStrip(stripProgress);
    mode = 'strip';
    deck.classList.add('is-transitioning');
    deck.classList.add('is-strip');
    updateInterface();
    await wait(reducedMotion ? 10 : 760);
    deck.classList.remove('is-transitioning');
    deck.classList.add('is-browsing');
    locked = false;
  };

  const expandFromStrip = async (requested = active) => {
    if (locked || mode !== 'strip') return;
    locked = true;
    window.clearTimeout(stripSettle);
    const next = clamp(requested, 0, total - 1);
    const travel = Math.abs(next - stripProgress);
    stripTarget = next;
    stripGestureActive = false;
    startStripMotion();
    await wait(reducedMotion ? 10 : Math.min(680, 320 + travel * 85));

    if (stripFrame !== null) cancelAnimationFrame(stripFrame);
    stripFrame = null;
    stripFrameTime = 0;
    stripProgress = next;
    stripTarget = next;
    active = next;
    renderStrip(stripProgress);
    updateInterface();
    deck.classList.remove('is-browsing');
    deck.classList.add('is-transitioning');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    mode = 'expanded';
    deck.classList.remove('is-strip');
    updateInterface();
    await wait(reducedMotion ? 10 : 760);
    deck.classList.remove('is-transitioning');
    locked = false;
  };

  const slideFullScreen = async (requested) => {
    if (locked || mode !== 'expanded') return;
    const next = (requested + total) % total;
    if (next === active) return;
    locked = true;

    const outgoing = cards[active];
    const incoming = cards[next];
    const direction = requested > active ? 1 : -1;
    const duration = reducedMotion ? 10 : 880;
    const easing = 'cubic-bezier(.76, 0, .24, 1)';
    ensureCardMedia(next);
    deck.classList.add('is-sliding');
    outgoing.classList.add('is-slide-layer');
    incoming.classList.add('is-slide-layer');
    outgoing.classList.add('is-animating');
    incoming.classList.add('is-animating');

    const incomingVideo = incoming.classList.contains('deck-card--comparison') ? null : incoming.querySelector('video');
    if (incomingVideo) incomingVideo.play().catch(() => {});

    const outgoingAnimation = outgoing.animate([
      { transform: 'translate(-50%, -50%) translateX(0)' },
      { transform: `translate(-50%, -50%) translateX(${-direction * 100}vw)` }
    ], { duration, easing, fill: 'both' });
    const incomingAnimation = incoming.animate([
      { transform: `translate(-50%, -50%) translateX(${direction * 100}vw)` },
      { transform: 'translate(-50%, -50%) translateX(0)' }
    ], { duration, easing, fill: 'both' });

    await Promise.all([outgoingAnimation.finished, incomingAnimation.finished]);
    active = next;
    updateInterface();
    outgoing.classList.remove('is-slide-layer');
    incoming.classList.remove('is-slide-layer');
    outgoing.classList.remove('is-animating');
    incoming.classList.remove('is-animating');
    outgoingAnimation.cancel();
    incomingAnimation.cancel();
    deck.classList.remove('is-sliding');
    locked = false;
  };

  const runLoader = async () => {
    let loaderSeen = false;
    try { loaderSeen = sessionStorage.getItem('steven-home-loader') === 'seen'; } catch {}

    if (reducedMotion || loaderSeen) {
      document.body.classList.remove('is-loading');
      loader.remove();
      locked = false;
      updateInterface();
      return;
    }

    const leadImage = cards[0].querySelector('img');
    const leadReady = leadImage?.decode ? leadImage.decode().catch(() => {}) : Promise.resolve();
    await Promise.race([leadReady, wait(240)]);

    const started = performance.now();
    await new Promise((resolve) => {
      let lastPercent = -1;
      const count = (now) => {
        const progress = Math.min(1, (now - started) / 280);
        const percent = Math.min(100, Math.floor(progress * 25) * 4);
        if (percent !== lastPercent) {
          loaderPercent.textContent = `${percent}%`;
          lastPercent = percent;
        }
        if (progress < 1) requestAnimationFrame(count);
        else resolve();
      };
      requestAnimationFrame(count);
    });

    await wait(40);
    loader.classList.add('is-row');
    await wait(150);
    loader.classList.add('is-mosaic');
    await wait(300);
    loader.classList.add('is-opening');
    await wait(360);
    document.body.classList.remove('is-loading');
    loader.classList.add('is-finished');
    locked = false;
    updateInterface();
    try { sessionStorage.setItem('steven-home-loader', 'seen'); } catch {}
    await wait(220);
    loader.remove();
  };

  window.addEventListener('wheel', (event) => {
    if (event.ctrlKey || locked) return;
    event.preventDefault();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    window.clearTimeout(wheelRelease);
    wheelRelease = window.setTimeout(() => {
      wheelReady = true;
      wheelIntent = 0;
    }, 220);
    if (!wheelReady) return;

    if (mode === 'strip') {
      browseStrip(delta);
      return;
    }

    wheelIntent += delta;
    if (Math.abs(wheelIntent) < 28) return;
    wheelIntent = 0;
    wheelReady = false;
    collapseToStrip();
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && mode === 'strip') expandFromStrip();
    if (event.key === 'Escape' && mode === 'strip') expandFromStrip();
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') {
      if (mode === 'strip') nudgeStrip(1);
      else slideFullScreen(active + 1);
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      if (mode === 'strip') nudgeStrip(-1);
      else slideFullScreen(active - 1);
    }
  });

  deck.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    pointerStart = event.clientX;
    pointerStartY = event.clientY;
    pointerStartCard = event.target.closest('.deck-card') || cardAtPoint(event.clientX, event.clientY);
    pointerTravel = 0;
    if (mode === 'strip') {
      pointerStartTarget = stripTarget;
      deck.classList.add('is-dragging');
      deck.setPointerCapture(event.pointerId);
    }
  });
  deck.addEventListener('pointermove', (event) => {
    if (pointerStart === null || mode !== 'strip' || locked) return;
    const delta = event.clientX - pointerStart;
    const verticalDelta = event.clientY - pointerStartY;
    pointerTravel = Math.max(pointerTravel, Math.hypot(delta, verticalDelta));
    const { distance } = stripMetrics();
    stripTarget = clamp(pointerStartTarget - (delta / distance), 0, total - 1);
    startStripMotion();
  });
  deck.addEventListener('pointerup', (event) => {
    if (pointerStart === null) return;
    const deltaX = event.clientX - pointerStart;
    const deltaY = event.clientY - pointerStartY;
    const clickedCard = pointerStartCard;
    pointerStart = null;
    pointerStartY = null;
    pointerStartCard = null;
    if (deck.hasPointerCapture(event.pointerId)) deck.releasePointerCapture(event.pointerId);
    deck.classList.remove('is-dragging');
    if (mode === 'strip') {
      if (pointerTravel > 8) {
        suppressCardClickUntil = performance.now() + 260;
        stripTarget = clamp(Math.round(stripTarget), 0, total - 1);
        startStripMotion();
      } else if (clickedCard) {
        suppressCardClickUntil = performance.now() + 260;
        expandFromStrip(cards.indexOf(clickedCard));
      }
    } else if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
      slideFullScreen(active + (deltaX < 0 ? 1 : -1));
    }
  });
  deck.addEventListener('pointercancel', (event) => {
    pointerStart = null;
    pointerStartY = null;
    pointerStartCard = null;
    if (deck.hasPointerCapture(event.pointerId)) deck.releasePointerCapture(event.pointerId);
    deck.classList.remove('is-dragging');
  });

  cards.forEach((card, index) => {
    card.addEventListener('click', (event) => {
      if (mode !== 'strip') return;
      event.preventDefault();
      if (performance.now() < suppressCardClickUntil) return;
      expandFromStrip(index);
    });
    card.addEventListener('keydown', (event) => {
      if (mode !== 'strip' || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      expandFromStrip(index);
    });
  });

  thumbnails.forEach((thumbnail) => thumbnail.addEventListener('click', () => {
    const requested = Number(thumbnail.dataset.slide);
    slideFullScreen(requested);
  }));
  document.querySelector('.stage-step--prev').addEventListener('click', () => slideFullScreen(active - 1));
  document.querySelector('.stage-step--next').addEventListener('click', () => slideFullScreen(active + 1));
  pagination.addEventListener('click', () => {
    if (mode === 'strip') expandFromStrip(active);
    else collapseToStrip();
  });
  window.addEventListener('resize', () => {
    if (resizeFrame !== null) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      renderStrip(stripProgress);
      syncThumbnailGeometry();
    });
  });
  motionPreference.addEventListener('change', (event) => {
    reducedMotion = event.matches;
    if (!reducedMotion) return;
    if (stripFrame !== null) cancelAnimationFrame(stripFrame);
    stripFrame = null;
    stripFrameTime = 0;
    stripProgress = stripTarget;
    renderStrip(stripProgress);
    selectNearestStripCard();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    cards.forEach((card) => {
      if (!card.classList.contains('deck-card--comparison')) card.querySelector('video')?.pause();
    });
  });

  renderStrip(active);
  syncThumbnailGeometry();
  runLoader();
})();
