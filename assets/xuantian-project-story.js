(function (scope) {
  'use strict';

  // Each scene owns a scroll beat, including the last scene before release.
  // Native scrolling only: no wheel interception, timers or automatic page jumps.
  function sampleScroll(distance, step, count) {
    const length = Math.max(1, Math.floor(count));
    const beat = Math.max(1, step);
    const travel = beat * length;
    return {
      index: Math.min(length - 1, Math.max(0, Math.floor(distance / beat))),
      progress: Math.min(1, Math.max(0, distance / travel)),
      travel,
      released: distance >= travel
    };
  }

  function mount(root, win) {
    if (!root) return;
    const doc = root.ownerDocument;
    const pin = root.querySelector('.xj-project-story__pin');
    const scenes = [...root.querySelectorAll('[data-story-scene]')];
    const images = scenes.map(scene => scene.querySelector('img'));
    const selectors = [...root.querySelectorAll('[data-story-select]')];
    const status = root.querySelector('[data-story-status]');
    const hint = root.querySelector('[data-story-hint]');
    const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    let pinned = false;
    let failed = false;
    let active = -1;
    let top = 88;
    let step = 700;
    let frame = 0;
    let measureNeeded = true;

    const show = (index, force = false) => {
      if (index === active && !force) return;
      active = index;
      root.dataset.scene = String(index);
      scenes.forEach((scene, i) => {
        const hidden = pinned && i !== index;
        scene.classList.toggle('is-active', i === index);
        scene.setAttribute('aria-hidden', String(hidden));
        scene.inert = hidden;
      });
      selectors.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      status.setAttribute('aria-live', 'off');
      status.textContent = scenes[index].getAttribute('aria-label');
      hint.textContent = index < scenes.length - 1
        ? '向下滚动 · 进入' + selectors[index + 1].textContent.trim().replace(/^\d+\s*/, '')
        : '继续向下 · 探索世界观';
    };

    const measure = () => {
      top = Math.ceil(doc.querySelector('.xj-header')?.getBoundingClientRect().height || 88);
      const available = win.innerHeight - top;
      // A too-tall pinned panel would hide copy/controls. Use sequential flow instead.
      pinned = !failed && !motion.matches && win.innerWidth > 900 && available >= 680;
      root.style.setProperty('--story-top', top + 'px');
      root.style.setProperty('--story-frame-width', Math.max(0, Math.min(root.clientWidth, (available - 80) * 1.5)) + 'px');
      root.classList.toggle('is-scroll-story', pinned);
      root.style.removeProperty('height');
      if (pinned) {
        const panelHeight = pin.getBoundingClientRect().height;
        if (panelHeight > available + 1) {
          pinned = false;
          root.classList.remove('is-scroll-story');
        } else {
          step = Math.max(560, Math.round(available * .82));
          root.style.height = Math.ceil(panelHeight) + step * scenes.length + 'px';
        }
      }
      root.dataset.scrollMode = pinned ? 'pinned' : 'flow';
      show(Math.max(0, active), true);
    };

    const update = () => {
      frame = 0;
      if (measureNeeded) { measureNeeded = false; measure(); }
      if (pinned) {
        const position = sampleScroll(top - root.getBoundingClientRect().top, step, scenes.length);
        show(position.index);
        root.style.setProperty('--story-progress', String(position.progress));
        root.dataset.released = String(position.released);
      } else {
        // Both scenes remain readable; only the chapter indicator changes on scroll.
        const index = scenes.reduce((current, scene, i) =>
          scene.getBoundingClientRect().top <= top + win.innerHeight * .3 ? i : current, 0);
        show(index);
        root.style.setProperty('--story-progress', String((index + 1) / scenes.length));
        root.dataset.released = 'true';
      }
    };
    const requestUpdate = () => { if (!frame) frame = win.requestAnimationFrame(update); };
    const requestMeasure = () => { measureNeeded = true; requestUpdate(); };

    selectors.forEach((button, index) => button.addEventListener('click', () => {
      // Chapter buttons navigate the same timeline as wheel, touch and keyboard input.
      const target = pinned
        ? win.scrollY + root.getBoundingClientRect().top - top + step * (index + .25)
        : win.scrollY + scenes[index].getBoundingClientRect().top - top;
      win.scrollTo({ top: target, behavior: motion.matches ? 'instant' : 'smooth' });
    }));
    root.querySelector('.xj-project-story__controls').hidden = false;
    win.addEventListener('scroll', requestUpdate, { passive: true });
    win.addEventListener('resize', requestMeasure, { passive: true });
    win.addEventListener('pageshow', requestMeasure);
    motion.addEventListener('change', requestMeasure);
    doc.fonts?.ready.then(requestMeasure);

    const loaded = images.map(image => new Promise(resolve => {
      const complete = () => {
        if (!image.naturalWidth) { resolve(false); return; }
        (image.decode ? image.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(true));
      };
      if (image.complete) complete();
      else {
        image.addEventListener('load', complete, { once: true });
        image.addEventListener('error', () => resolve(false), { once: true });
      }
    }));
    Promise.all(loaded).then(results => {
      failed = !results.every(Boolean);
      if (failed) status.textContent = '部分图片暂未加载，已改为顺序阅读。';
      requestMeasure();
    });
    if ('IntersectionObserver' in win) {
      const preload = new win.IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        images.forEach(image => { image.loading = 'eager'; });
        preload.disconnect();
      }, { rootMargin: '600px 0px' });
      preload.observe(root);
    } else images.forEach(image => { image.loading = 'eager'; });

    // Synchronous measurement avoids flashing the sequential fallback on page load.
    update();
    return { update, get active() { return active; }, get pinned() { return pinned; } };
  }

  if (typeof module === 'object' && module.exports) module.exports = { sampleScroll, mount };
  else mount(scope.document.querySelector('.xj-project-story'), scope);
})(typeof window === 'object' ? window : this);
