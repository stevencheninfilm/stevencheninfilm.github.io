(() => {
  const section = document.querySelector('[data-news]');
  if (!section) return;

  const pin = section.querySelector('.ai-news__pin');
  const items = [...section.querySelectorAll('[data-news-item]')];
  const steps = [...section.querySelectorAll('[data-news-step]')];
  const counter = section.querySelector('[data-news-current]');
  const edition = section.querySelector('.ai-news__edition');
  const header = document.querySelector('.site-header');
  if (!pin || items.length !== 2 || steps.length !== 2 || !counter) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.min(1, Math.max(0, value));
  let frame = 0;
  let nearViewport = true;
  let top = 100;
  let active = -1;
  let lastProgress = -1;

  function setActive(index) {
    if (index === active) return;
    active = index;
    items.forEach((item, i) => {
      const hidden = i !== index;
      item.setAttribute('aria-hidden', String(hidden));
      item.inert = hidden;
      steps[i].setAttribute('aria-pressed', String(!hidden));
    });
    counter.textContent = String(index + 1).padStart(2, '0');
    if (edition) edition.textContent = items[index].dataset.newsEdition;
  }

  function render() {
    frame = 0;
    if (reducedMotion.matches || !nearViewport) return;
    const range = Math.max(1, section.offsetHeight - pin.offsetHeight);
    const progress = clamp((top - section.getBoundingClientRect().top) / range);
    if (Math.abs(progress - lastProgress) < .0005) return;
    lastProgress = progress;

    // Hold each story before and after a short, reversible dissolve.
    const transition = clamp((progress - .38) / .24);
    const blend = transition * transition * (3 - 2 * transition);
    section.style.setProperty('--news-blend', blend.toFixed(4));
    section.style.setProperty('--news-enter-y', `${((1 - blend) * 24).toFixed(2)}px`);
    steps.forEach((step, i) => {
      step.style.setProperty('--news-step-progress', clamp(progress * 2 - i).toFixed(4));
    });
    setActive(progress < .5 ? 0 : 1);
  }

  function schedule() {
    if (!frame && !reducedMotion.matches && nearViewport) frame = requestAnimationFrame(render);
  }

  function measure() {
    top = Math.ceil((header?.getBoundingClientRect().height || 80) + 8);
    section.style.setProperty('--news-top', `${top}px`);
    lastProgress = -1;
    schedule();
  }

  function configure() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    active = -1;
    lastProgress = -1;
    section.classList.toggle('is-enhanced', !reducedMotion.matches);
    if (edition) edition.textContent = '2026';
    items.forEach(item => {
      item.inert = false;
      item.removeAttribute('aria-hidden');
    });
    if (!reducedMotion.matches) {
      setActive(0);
      measure();
    }
  }

  steps.forEach((step, index) => {
    step.addEventListener('click', () => {
      if (reducedMotion.matches) return;
      const range = Math.max(1, section.offsetHeight - pin.offsetHeight);
      const storyProgress = index === 0 ? .12 : .82;
      const target = window.scrollY + section.getBoundingClientRect().top - top + range * storyProgress;
      window.scrollTo({ top: target, behavior: 'smooth' });
    });
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      nearViewport = entries[0].isIntersecting;
      if (nearViewport) {
        items.forEach(item => { item.querySelector('img').loading = 'eager'; });
        schedule();
      }
    }, { rootMargin: '100% 0px' });
    observer.observe(section);
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('pageshow', measure);
  reducedMotion.addEventListener('change', configure);
  if (header && 'ResizeObserver' in window) new ResizeObserver(measure).observe(header);
  configure();
})();
