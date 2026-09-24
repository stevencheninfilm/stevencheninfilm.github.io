(() => {
  const body = document.body;
  const cloud = document.querySelector('.xj-cloud-reveal');
  const leaf = document.querySelector('.xj-leaf');
  const header = document.querySelector('.xj-header');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Keep the atlas in context: hover to inspect details, leave to restore the full map.
  const atlas = document.querySelector('.xj-atlas__viewport');
  const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (atlas) {
    let mapFrame = 0;
    let mapX = 50;
    let mapY = 50;
    const positionMap = () => {
      if (mapFrame) return;
      mapFrame = requestAnimationFrame(() => {
        mapFrame = 0;
        atlas.style.setProperty('--map-x', `${mapX}%`);
        atlas.style.setProperty('--map-y', `${mapY}%`);
      });
    };
    const resetMap = () => atlas.classList.remove('is-zoomed');
    const configureMap = () => {
      atlas.classList.toggle('is-zoomable', hoverPointer.matches);
      atlas.tabIndex = hoverPointer.matches ? 0 : -1;
      atlas.setAttribute('aria-label', hoverPointer.matches
        ? '玄天宗全境图局部浏览，方向键移动，Escape 恢复全图'
        : '玄天宗全境图');
      if (hoverPointer.matches) atlas.setAttribute('aria-describedby', 'atlas-hint');
      else atlas.removeAttribute('aria-describedby');
      resetMap();
    };
    const pointMap = (event) => {
      if (!hoverPointer.matches || event.pointerType === 'touch') return;
      const bounds = atlas.getBoundingClientRect();
      mapX = Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100));
      mapY = Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100));
      positionMap();
      atlas.classList.add('is-zoomed');
    };
    atlas.addEventListener('pointerenter', pointMap);
    atlas.addEventListener('pointermove', pointMap);
    atlas.addEventListener('pointerleave', resetMap);
    atlas.addEventListener('pointercancel', resetMap);
    atlas.addEventListener('focus', () => {
      if (!hoverPointer.matches || !atlas.matches(':focus-visible')) return;
      mapX = mapY = 50;
      positionMap();
      atlas.classList.add('is-zoomed');
    });
    atlas.addEventListener('blur', resetMap);
    atlas.addEventListener('keydown', (event) => {
      if (!hoverPointer.matches) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        resetMap();
        return;
      }
      const steps = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] };
      if (!steps[event.key]) return;
      event.preventDefault();
      mapX = Math.max(0, Math.min(100, mapX + steps[event.key][0]));
      mapY = Math.max(0, Math.min(100, mapY + steps[event.key][1]));
      positionMap();
      atlas.classList.add('is-zoomed');
    });
    hoverPointer.addEventListener('change', configureMap);
    window.addEventListener('resize', resetMap);
    configureMap();
  }

  const preset = window.XuantianFlightPreset;
  const legacyFlight = preset && window.XuantianFlight ? window.XuantianFlight.create(preset) : window.XuantianFlight;
  // Approved production opening: 02, volumetric clouds + original 2D mountains.
  // Keep explicit review overrides and the legacy renderer as a safe fallback.
  // Saved Flight Studio settings are not overwritten.
  const opening = /(?:\?|&)opening=(3d|hybrid|2d)(?:&|$)/.exec(window.location?.search || '')?.[1] || 'hybrid';
  const try3D = opening !== '2d' && window.XuantianVolumeRenderer;
  const mountainCards = opening !== '3d';
  let flight = try3D ? window.XuantianVolumeScene : legacyFlight;
  if (try3D && !reducedMotion.matches) body.classList.add('xj-volume-opening');
  let flightFrame = 0;
  let revealFinished = false;
  let renderer = null;
  const revealTimers = [];
  const later = (callback,delay) => {
    const id=window.setTimeout(callback,delay);
    revealTimers.push(id);
    return id;
  };
  const finishReveal = () => {
    if (revealFinished) return;
    revealFinished = true;
    revealTimers.forEach(id=>window.clearTimeout(id));
    if (flightFrame) window.cancelAnimationFrame(flightFrame);
    flightFrame = 0;
    body.classList.remove('is-revealing');
    cloud?.classList.add('is-gone');
    renderer?.destroy();
  };

  if (reducedMotion.matches || !flight || !window.XuantianFlightRenderer) {
    finishReveal();
  } else {
    // Slow/failed textures must never leave a permanent loading curtain.
    const prepareTimeout=later(finishReveal,try3D ? 5000 : 2500);
    const prepare = try3D
      ? window.XuantianVolumeRenderer(cloud, {mountains:mountainCards?'cards':'reference',onFailure:finishReveal}).catch(() => {
          body.classList.remove('xj-volume-opening');
          flight=legacyFlight;
          return window.XuantianFlightRenderer(cloud, {flight,sprites:preset?.sprites});
        })
      : window.XuantianFlightRenderer(cloud, {flight,sprites:preset?.sprites});
    prepare.then(ready => {
      if (revealFinished) {ready.destroy();return;}
      renderer=ready;
      window.clearTimeout(prepareTimeout);
      cloud.classList.add('is-ready');
      later(() => {
        if (revealFinished) return;
        cloud.classList.add('is-open');
        const start=window.performance.now();
        const tick=now => {
          if (revealFinished) return;
          renderer.draw(now-start);
          if (now-start<flight.endAt-flight.startDelay) flightFrame=window.requestAnimationFrame(tick);
          else finishReveal();
        };
        flightFrame=window.requestAnimationFrame(tick);
      },flight.startDelay);
      // Timers begin only after all textures and the hero have decoded.
      later(()=>body.classList.remove('is-revealing'),flight.titleAt);
      later(finishReveal,flight.endAt);
    }).catch(finishReveal);
  }

  const updateLeaf = () => {
    if (!leaf || reducedMotion.matches) return;
    const statement = document.querySelector('.xj-statement');
    const end = Math.max(1, (statement?.offsetTop || window.innerHeight * 1.7) + (statement?.offsetHeight || 0));
    const progress = Math.min(1, Math.max(0, window.scrollY / end));
    const fadeIn = Math.min(1, progress * 9);
    const fadeOut = Math.min(1, Math.max(0, (1 - progress) * 4));
    leaf.style.setProperty('--leaf-y', `${progress * Math.min(window.innerHeight * .72, 640)}px`);
    leaf.style.setProperty('--leaf-turn', `${progress * 150 - 18}deg`);
    leaf.style.setProperty('--leaf-alpha', String(.86 * fadeIn * fadeOut));
  };

  let leafFrame = 0;
  const requestLeafUpdate = () => {
    if (leafFrame) return;
    leafFrame = requestAnimationFrame(() => {
      leafFrame = 0;
      header?.classList.toggle('is-scrolled', window.scrollY > 60);
      updateLeaf();
    });
  };

  window.addEventListener('scroll', requestLeafUpdate, { passive: true });
  window.addEventListener('resize', requestLeafUpdate);
  requestLeafUpdate();

  const reveals = [...document.querySelectorAll('.xj-reveal')];
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: .08 });
    reveals.forEach((item) => observer.observe(item));
  } else {
    reveals.forEach((item) => item.classList.add('is-visible'));
  }

  reducedMotion.addEventListener('change', (event) => {
    if (!event.matches) return;
    finishReveal();
    reveals.forEach((item) => item.classList.add('is-visible'));
  });
})();
