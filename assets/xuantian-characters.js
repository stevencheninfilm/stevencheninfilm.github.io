(function (scope) {
  'use strict';

  function sampleScroll(distance, step, count = 3) {
    const beat = Math.max(1, step);
    return {
      index: Math.max(0, Math.min(count - 1, Math.floor(distance / beat))),
      released: distance >= beat * count
    };
  }

  // Playback advances in real time; scrolling selects the next stopping point.
  // A still extracted from that exact frame makes every hold deterministic.
  function createCuePlayer(video, cues, onState, win) {
    let target = -1, held = -1, running = false, generation = 0;
    let videoFrame = null, animationFrame = null;
    const cancel = () => {
      if (videoFrame !== null) video.cancelVideoFrameCallback?.(videoFrame);
      if (animationFrame !== null) win.cancelAnimationFrame(animationFrame);
      videoFrame = animationFrame = null;
    };
    const finish = () => {
      cancel();
      running = false;
      video.pause();
      held = target;
      // Seek inside the selected 24 fps frame, not on a rounding boundary.
      try { video.currentTime = cues[target] + 1 / 96; } catch { /* poster is the fallback */ }
      onState({ phase: 'held', index: target });
    };
    const check = (_now, metadata) => {
      videoFrame = animationFrame = null;
      if (!running) return;
      if (Math.max(video.currentTime, metadata?.mediaTime || 0) >= cues[target]) finish();
      else schedule();
    };
    const schedule = () => {
      if (video.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(check);
      else animationFrame = win.requestAnimationFrame(check);
    };
    const go = (index, { instant = false, restart = false } = {}) => {
      if (!Number.isInteger(index) || index < 0 || index >= cues.length) return;
      if (!restart && target === index && (held === index || (running && !instant))) return;
      const ticket = ++generation;
      cancel();
      video.pause();
      target = index;
      held = -1;
      if (restart) {
        try { video.currentTime = index ? cues[index - 1] + 1 / 96 : 0; } catch { /* pending metadata */ }
      }
      if (instant || video.currentTime >= cues[index]) { finish(); return; }
      running = true;
      onState({ phase: 'loading', index });
      schedule();
      try {
        Promise.resolve(video.play()).then(() => {
          if (ticket !== generation && !running) video.pause();
        }).catch(() => {
          if (ticket !== generation) return;
          cancel();
          running = false;
          video.pause();
          onState({ phase: 'blocked', index });
        });
      } catch {
        cancel();
        running = false;
        onState({ phase: 'blocked', index });
      }
    };
    video.addEventListener('playing', () => {
      if (running) onState({ phase: 'playing', index: target });
      else video.pause();
    });
    video.addEventListener('timeupdate', () => {
      if (running && video.currentTime >= cues[target]) finish();
    });
    video.addEventListener('ended', () => { if (running) finish(); });
    video.addEventListener('error', () => {
      if (target < 0) return;
      ++generation;
      cancel();
      running = false;
      onState({ phase: 'blocked', index: target });
    });
    return {
      go,
      suspend() { ++generation; cancel(); running = false; target = -1; video.pause(); },
      get target() { return target; },
      get running() { return running; }
    };
  }

  function mount(root, win) {
    if (!root) return;
    const doc = root.ownerDocument;
    const video = root.querySelector('video');
    const scenes = [...root.querySelectorAll('[data-character-cue]')];
    const stills = [...root.querySelectorAll('[data-character-still]')];
    const buttons = [...root.querySelectorAll('[data-character-select]')];
    const controls = root.querySelector('.xj-characters__controls');
    const resume = root.querySelector('[data-character-resume]');
    const hint = root.querySelector('[data-character-hint]');
    const status = root.querySelector('[data-character-status]');
    const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    const cues = scenes.map(scene => Number(scene.dataset.characterCue));
    let enhanced = false, loaded = false, loading = null, objectUrl = '';
    let top = 88, step = 700, frame = 0, measuring = true;
    let desired = 0;
    const show = ({ phase, index }) => {
      root.dataset.phase = phase;
      root.dataset.character = String(index);
      scenes.forEach((scene, i) => {
        scene.classList.toggle('is-active', i === index);
        scene.setAttribute('aria-hidden', String(enhanced && i !== index));
        scene.inert = enhanced && i !== index;
      });
      stills.forEach((still, i) => still.classList.toggle('is-active', i === index));
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      resume.hidden = !enhanced || phase !== 'blocked';
      hint.textContent = index < scenes.length - 1
        ? '继续下滑 · 认识' + scenes[index + 1].dataset.characterName
        : '继续下滑 · 探索世界观';
      status.textContent = phase === 'held' || phase === 'blocked' ? scenes[index].dataset.characterName : '';
    };
    const player = createCuePlayer(video, cues, show, win);
    const load = () => {
      if (loaded) return Promise.resolve(true);
      if (!enhanced) return Promise.resolve(false);
      if (loading) return loading;
      stills.forEach(image => { image.loading = 'eager'; });
      video.muted = true;
      const source = win.innerWidth <= 760 ? video.dataset.mobileSrc : video.dataset.src;
      // A local preview server may omit byte-range responses. WebKit then resets
      // currentTime to zero on every seek. A small, cached blob is fully seekable.
      loading = (async () => {
        try {
          if (win.location.protocol === 'file:') video.src = source;
          else {
            const response = await win.fetch(source);
            if (!response.ok) throw new Error('Character film unavailable');
            objectUrl = win.URL.createObjectURL(await response.blob());
            video.src = objectUrl;
          }
          video.load();
          loaded = true;
          requestUpdate();
          return true;
        } catch {
          show({ phase: 'blocked', index: desired });
          return false;
        } finally { loading = null; }
      })();
      return loading;
    };
    const measure = () => {
      top = Math.ceil(doc.querySelector('.xj-header')?.getBoundingClientRect().height || 88);
      const available = win.innerHeight - top;
      // Short screens and reduced motion keep all portraits/copy in normal flow.
      enhanced = !motion.matches && available >= 560;
      root.classList.toggle('is-enhanced', enhanced);
      root.style.setProperty('--characters-top', top + 'px');
      root.style.setProperty('--characters-height', available + 'px');
      step = Math.max(620, Math.round(available * 1.05));
      root.style.height = enhanced ? available + step * scenes.length + 'px' : '';
      controls.hidden = !enhanced;
      if (!enhanced) {
        player.suspend();
        resume.hidden = true;
        scenes.forEach(scene => { scene.removeAttribute('aria-hidden'); scene.inert = false; });
      }
    };
    const update = () => {
      frame = 0;
      if (measuring) { measuring = false; measure(); }
      if (!enhanced) return;
      const rect = root.getBoundingClientRect();
      const position = sampleScroll(top - rect.top, step, scenes.length);
      desired = position.index;
      root.dataset.released = String(position.released);
      const visible = rect.top < win.innerHeight * .78 && rect.bottom > top;
      if (doc.hidden || !visible) { player.suspend(); return; }
      load();
      if (!loaded) return;
      player.go(desired, { instant: position.released });
    };
    const requestUpdate = () => { if (!frame) frame = win.requestAnimationFrame(update); };
    const requestMeasure = () => { measuring = true; requestUpdate(); };
    buttons.forEach((button, index) => button.addEventListener('click', () => {
      const y = win.scrollY + root.getBoundingClientRect().top - top + step * (index + .18);
      win.scrollTo({ top: y, behavior: 'smooth' });
    }));
    resume.addEventListener('click', async () => {
      if (await load()) player.go(desired, { restart: true });
    });
    win.addEventListener('scroll', requestUpdate, { passive: true });
    win.addEventListener('resize', requestMeasure, { passive: true });
    win.addEventListener('pageshow', requestMeasure);
    win.addEventListener('pagehide', event => {
      player.suspend();
      if (!event.persisted && objectUrl) win.URL.revokeObjectURL(objectUrl);
    });
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) player.suspend(); else requestUpdate(); });
    motion.addEventListener('change', requestMeasure);
    doc.fonts?.ready.then(requestMeasure);
    if ('IntersectionObserver' in win) {
      const observer = new win.IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { load(); requestUpdate(); }
      }, { rootMargin: '500px 0px' });
      observer.observe(root);
    }
    update();
    return { player, update };
  }

  if (typeof module === 'object' && module.exports) module.exports = { sampleScroll, createCuePlayer, mount };
  else mount(scope.document.querySelector('#characters'), scope);
})(typeof window === 'object' ? window : this);
