(() => {
  const section = document.querySelector('[data-workflows]');
  if (!section) return;
  const pin = section.querySelector('.ai-workflows__pin');
  const items = [...section.querySelectorAll('[data-workflow-item]')];
  const steps = [...section.querySelectorAll('[data-workflow-step]')];
  const counter = section.querySelector('[data-workflow-counter]');
  const header = document.querySelector('.site-header');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-height: 650px)');
  const staticLayout = () => motion.matches || compact.matches;
  let top = 100, frame = 0, active = -1;
  const clamp = value => Math.max(0, Math.min(1, value));
  const range = () => Math.max(1, section.offsetHeight - pin.offsetHeight - top);
  const start = () => window.scrollY + section.getBoundingClientRect().top;
  const setActive = index => {
    if (index === active) return;
    active = index;
    items.forEach((item, i) => {
      item.inert = !staticLayout() && i !== index;
      if (!staticLayout()) item.setAttribute('aria-hidden', String(i !== index));
      else item.removeAttribute('aria-hidden');
      steps[i].setAttribute('aria-current', String(i === index));
    });
    counter.textContent = `${String(index + 1).padStart(2, '0')} / 02`;
  };
  const render = () => {
    frame = 0;
    if (staticLayout()) return;
    const progress = clamp(-section.getBoundingClientRect().top / range());
    setActive(progress < .5 ? 0 : 1);
    steps.forEach((step, i) => step.style.setProperty('--workflow-progress', clamp(progress * 2 - i)));
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
  const navigate = (index, behavior = 'smooth') => {
    if (staticLayout()) {
      items[index].scrollIntoView({ behavior: 'auto', block: 'start' });
      setActive(index);
    } else {
      window.scrollTo({ top: start() + range() * (index ? .78 : .08), behavior });
      if (behavior === 'instant' || behavior === 'auto') render();
    }
  };
  const followHash = () => {
    const index = items.findIndex(item => `#${item.id}` === location.hash);
    if (index !== -1) navigate(index, 'instant');
  };
  const measure = () => {
    top = Math.ceil(header.getBoundingClientRect().height + 8);
    section.style.setProperty('--workflow-top', `${top}px`);
    schedule();
  };
  const configure = () => {
    section.classList.toggle('is-enhanced', !staticLayout());
    active = -1;
    measure(); setActive(0); schedule();
  };
  steps.forEach((step, i) => step.addEventListener('click', event => {
    event.preventDefault();
    history.replaceState(null, '', step.getAttribute('href'));
    navigate(i, motion.matches ? 'auto' : 'smooth');
  }));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('hashchange', followHash);
  window.addEventListener('pageshow', () => { measure(); followHash(); });
  for (const preference of [motion, compact]) preference.addEventListener('change', () => { configure(); followHash(); });
  new ResizeObserver(measure).observe(header);
  configure();
  requestAnimationFrame(followHash);
})();
