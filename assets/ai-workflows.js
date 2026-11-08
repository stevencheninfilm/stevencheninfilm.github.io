(() => {
  const section = document.querySelector('[data-workflows]');
  if (!section) return;
  const pin = section.querySelector('.ai-workflows__pin');
  const items = [...section.querySelectorAll('[data-workflow-item]')];
  const steps = [...section.querySelectorAll('[data-workflow-step]')];
  const counter = section.querySelector('[data-workflow-counter]');
  const count = items.length;
  if (!pin || !count || steps.length !== count || !counter) return;
  section.style.setProperty('--workflow-count', count);
  const header = document.querySelector('.site-header');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-height: 650px)');
  const phone = matchMedia('(max-width: 680px)');
  const needsFlow = () => motion.matches || compact.matches || phone.matches;
  let top = 100, frame = 0, measureFrame = 0, active = -1, measuredRange = 0;
  let enhanced = false, initialized = false, fitFallback = false, fitDirty = true;
  let nearViewport = true;
  const clamp = value => Math.max(0, Math.min(1, value));
  const range = () => Math.max(1, section.offsetHeight - pin.offsetHeight - top);
  const start = () => window.scrollY + section.getBoundingClientRect().top;
  const setActive = index => {
    if (index === active) return;
    active = index;
    items.forEach((item, i) => {
      item.inert = enhanced && i !== index;
      if (enhanced) item.setAttribute('aria-hidden', String(i !== index));
      else item.removeAttribute('aria-hidden');
      steps[i].setAttribute('aria-current', String(i === index));
    });
    counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
  };
  const applyLayout = () => {
    const next = !needsFlow() && !fitFallback;
    section.classList.toggle('is-fit-fallback', fitFallback && !needsFlow());
    if (initialized && next === enhanced) return;
    initialized = true;
    enhanced = next;
    section.classList.toggle('is-enhanced', enhanced);
    section.classList.toggle('is-flow', !enhanced);
    measuredRange = 0;
    fitDirty = enhanced;
    const previous = Math.max(0, active);
    active = -1;
    setActive(previous);
  };
  const fitsPinnedLayout = () => items.every(item => {
    // Read intrinsic overflow and actual picture geometry after styles have
    // settled. Hidden pinned stories still participate in layout measurement.
    if (item.clientHeight > 0 && item.scrollHeight > item.clientHeight + 2) return false;
    const picture = item.querySelector?.('.ab-compare__frame, .workflow-player__picture');
    const rect = picture?.getBoundingClientRect();
    return !rect || !rect.width || rect.height >= 180;
  });
  const renderFlow = () => {
    const line = top + 24;
    const rectangles = items.map(item => item.getBoundingClientRect());
    let index = 0;
    for (let i = 0; i < count; i++) {
      if (rectangles[i].top > line) break;
      index = i;
    }
    setActive(index);
    steps.forEach((step, i) => {
      const rect = rectangles[i];
      step.style.setProperty('--workflow-progress', clamp((line - rect.top) / Math.max(1, rect.height)));
    });
  };
  const render = () => {
    frame = 0;
    if (!nearViewport) return;
    if (enhanced && fitDirty) {
      fitDirty = false;
      if (!fitsPinnedLayout()) {
        // Latch until a viewport change. Re-measuring flow content must not
        // alternate between natural and pinned layouts in a resize loop.
        fitFallback = true;
        applyLayout();
      }
    }
    if (!enhanced) { renderFlow(); return; }
    const progress = clamp(-section.getBoundingClientRect().top / (measuredRange || range()));
    setActive(Math.min(count - 1, Math.floor(progress * count)));
    steps.forEach((step, i) => step.style.setProperty('--workflow-progress', clamp(progress * count - i)));
  };
  const schedule = () => {
    if (!frame && nearViewport) frame = requestAnimationFrame(render);
  };
  const navigate = (index, behavior = 'smooth') => {
    // Explicit navigation may enter from a deep link outside the observer's
    // current range; it should not wait for another scroll event to select it.
    nearViewport = true;
    // Resolve any pending fit fallback before choosing the coordinate system.
    // A pinned target is not the same location as a natural-flow story heading.
    if (enhanced && fitDirty) render();
    if (!enhanced) {
      items[index].scrollIntoView({ behavior: behavior === 'instant' ? 'auto' : behavior, block: 'start' });
      setActive(index);
    } else {
      // Land inside the selected story, away from a transition boundary.
      window.scrollTo({ top: start() + (measuredRange || range()) * (index + .5) / count, behavior });
      if (behavior === 'instant' || behavior === 'auto') render();
    }
  };
  const followHash = () => {
    const index = items.findIndex(item => `#${item.id}` === location.hash);
    if (index !== -1) navigate(index, 'instant');
  };
  const measure = () => {
    const oldProgress = enhanced && measuredRange ? -section.getBoundingClientRect().top / measuredRange : -1;
    const wasEnhanced = enhanced;
    top = Math.ceil((header?.getBoundingClientRect().height || 92) + 8);
    section.style.setProperty('--workflow-top', `${top}px`);
    applyLayout();
    fitDirty = enhanced;
    const nextRange = enhanced ? range() : 0;
    if (wasEnhanced && enhanced && oldProgress >= 0 && oldProgress <= 1 && Math.abs(nextRange - measuredRange) > 1) {
      window.scrollTo({ top: start() + nextRange * oldProgress, behavior: 'instant' });
    }
    measuredRange = nextRange;
    schedule();
  };
  const scheduleMeasure = () => {
    if (!measureFrame) measureFrame = requestAnimationFrame(() => { measureFrame = 0; measure(); });
  };
  const configure = () => { fitFallback = false; measure(); };
  const initialHash = location.hash;
  const returning = typeof performance !== 'undefined' && performance.getEntriesByType?.('navigation')[0]?.type === 'back_forward';
  let initialAllowed = !returning && items.some(item => `#${item.id}` === initialHash);
  let initialScheduled = false, pageShown = document.readyState === 'complete';
  let fontsReady = !document.fonts?.ready;
  const settleInitialHash = () => {
    if (!initialAllowed || initialScheduled || !pageShown || !fontsReady || location.hash !== initialHash) return;
    initialScheduled = true;
    requestAnimationFrame(() => {
      if (!initialAllowed || location.hash !== initialHash) return;
      initialAllowed = false;
      // Native fragment placement can run after the first animation frame.
      // Re-align once after initial layout, without interfering with reading.
      measure();
      followHash();
    });
  };
  for (const event of ['pointerdown', 'wheel', 'keydown']) {
    window.addEventListener(event, () => { initialAllowed = false; }, { once: true, passive: true });
  }
  document.fonts?.ready.then(() => { fontsReady = true; settleInitialHash(); });
  steps.forEach((step, i) => step.addEventListener('click', event => {
    event.preventDefault();
    history.replaceState(null, '', step.getAttribute('href'));
    navigate(i, motion.matches ? 'auto' : 'smooth');
  }));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { fitFallback = false; scheduleMeasure(); }, { passive: true });
  window.addEventListener('hashchange', () => { initialAllowed = false; followHash(); });
  // Returning from another page preserves the browser's reading position.
  window.addEventListener('pageshow', event => {
    scheduleMeasure();
    if (event.persisted) initialAllowed = false;
    else { pageShown = true; settleInitialHash(); }
  });
  for (const preference of [motion, compact, phone]) preference.addEventListener('change', configure);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(scheduleMeasure);
    if (header) observer.observe(header);
    items.forEach(item => {
      for (const selector of ['.ai-workflows__title', '.ai-workflows__description']) {
        const content = item.querySelector?.(selector);
        if (content) observer.observe(content);
      }
    });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      nearViewport = entries[0].isIntersecting;
      if (nearViewport) schedule();
      else if (frame) { cancelAnimationFrame(frame); frame = 0; }
    }, { rootMargin: '100% 0px' }).observe(section);
  }
  configure();
  if (!returning) requestAnimationFrame(followHash);
  settleInitialHash();
})();
