(() => {
  'use strict';
  const dialog = document.querySelector('[data-cinema]');
  const cards = [...document.querySelectorAll('.av-film[data-film]')];
  if (!dialog || !cards.length) return;
  const ids = cards.map(card => card.dataset.film);
  const chinese = document.documentElement.lang.startsWith('zh');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const toast = document.querySelector('[data-toast]');
  const announcement = dialog.querySelector('[data-copy-announcement]');
  const messages = chinese
    ? { copied: '链接已复制', failed: '未能复制链接，请直接打开。', unavailable: '当前浏览器暂不支持全屏。' }
    : { copied: 'Link copied', failed: 'Could not copy. Open the link directly.', unavailable: 'Full screen is unavailable in this browser.' };
  let activeFilm = null, returnFocus = null, activePreview = null, toastTimer;
  const panels = [...dialog.querySelectorAll('[data-watch-panel]')];
  const panelFor = id => panels.find(panel => panel.dataset.watchPanel === id);
  const animation = () => motion.matches ? 'instant' : 'smooth';
  // Later defer scripts attach transport listeners before DOMContentLoaded.
  let playersReady = document.readyState === 'complete', pendingInitialPlay = null;
  document.addEventListener('DOMContentLoaded', () => {
    playersReady = true;
    const requested = pendingInitialPlay;
    pendingInitialPlay = null;
    if (requested && motion.matches && dialog.open && activeFilm === requested) panelFor(requested)?.querySelector('[data-player-toggle]').click();
  }, { once: true });

  function announce(message) {
    clearTimeout(toastTimer);
    if (dialog.open) {
      announcement.textContent = message;
      toastTimer = setTimeout(() => { announcement.textContent = ''; }, 3200);
    } else {
      toast.textContent = message;
      toast.hidden = false;
      toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
    }
  }

  async function copyLink(url) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const field = document.createElement('textarea');
        field.value = url;
        Object.assign(field.style, { position: 'fixed', opacity: '0', inset: '0 auto auto 0' });
        (dialog.open ? dialog : document.body).append(field);
        const previous = document.activeElement;
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        previous?.focus({ preventScroll: true });
        if (!copied) throw new Error('Copy unavailable');
      }
      announce(messages.copied);
    } catch (_) { announce(messages.failed); }
  }

  // The posters own first paint. No video source is attached until interaction.
  const hoverStops = [];
  const canPreview = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return finePointer.matches && !motion.matches && !dialog.open && !document.querySelector('[data-lightbox][open]') && !document.hidden
      && !connection?.saveData && !/(^|-)2g$|3g/.test(connection?.effectiveType || '');
  };
  cards.forEach(card => {
    const poster = card.querySelector('.av-film-open');
    const video = card.querySelector('[data-hover-src]');
    let timer = 0, generation = 0, inside = false;
    function stop() {
      generation++;
      clearTimeout(timer);
      video.pause();
      card.classList.remove('has-preview');
      if (activePreview === stop) activePreview = null;
      // Cancel a departed request that has not produced a first frame yet.
      if (video.getAttribute('src') && video.readyState < 2) {
        video.removeAttribute('src'); video.load();
      }
    }
    poster.addEventListener('pointerenter', event => {
      inside = true;
      if (event.pointerType === 'touch' || !canPreview()) return;
      timer = setTimeout(() => {
        if (!inside || !canPreview()) return;
        activePreview?.();
        activePreview = stop;
        const current = ++generation;
        if (!video.getAttribute('src')) video.src = video.dataset.hoverSrc;
        video.muted = true;
        Promise.resolve(video.play()).then(() => {
          if (current !== generation) return;
          if (!inside || !canPreview()) return stop();
          card.classList.add('has-preview');
        }).catch(() => { if (current === generation) stop(); });
      }, 240);
    });
    poster.addEventListener('pointerleave', () => { inside = false; stop(); });
    video.addEventListener('error', stop);
    hoverStops.push(stop);
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) { inside = false; stop(); }
    }, { threshold: .1 }).observe(card);
  });
  const stopPreviews = () => hoverStops.forEach(stop => stop());
  motion.addEventListener('change', stopPreviews);
  finePointer.addEventListener('change', stopPreviews);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPreviews(); });
  window.addEventListener('pagehide', stopPreviews);
  document.addEventListener('avocado:galleryopen', stopPreviews);

  // The narrow layout is a native scroll-snap rail. Buttons are an alternative
  // to swiping, not a replacement for touch or trackpad scrolling.
  const rail = document.querySelector('[data-film-rail]');
  const railControls = document.querySelector('[data-rail-controls]');
  const previous = document.querySelector('[data-rail-prev]');
  const next = document.querySelector('[data-rail-next]');
  const railCount = document.querySelector('[data-rail-count]');
  let railIndex = 0, railFrame = 0;
  function drawRail() {
    railFrame = 0;
    const left = rail.getBoundingClientRect().left;
    const distances = cards.map(card => Math.abs(card.getBoundingClientRect().left - left));
    railIndex = distances.indexOf(Math.min(...distances));
    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    if (rail.scrollLeft > 1 && remaining < 2) railIndex = cards.length - 1;
    railCount.textContent = `0${railIndex + 1} / 0${cards.length}`;
    previous.disabled = railIndex === 0;
    next.disabled = railIndex === cards.length - 1;
  }
  function moveRail(index) {
    const target = cards[Math.max(0, Math.min(cards.length - 1, index))];
    rail.scrollTo({ left: target.offsetLeft, behavior: animation() });
  }
  railControls.hidden = false;
  previous.addEventListener('click', () => moveRail(railIndex - 1));
  next.addEventListener('click', () => moveRail(railIndex + 1));
  rail.addEventListener('scroll', () => { if (!railFrame) railFrame = requestAnimationFrame(drawRail); }, { passive: true });
  window.addEventListener('resize', drawRail);
  drawRail();

  const tabs = [...document.querySelectorAll('[data-note-tab]')];
  const notePanels = [...document.querySelectorAll('[data-note-panel]')];
  const relatedNotes = document.querySelectorAll('[data-related-note]');
  let selectedNote = null;
  function selectNote(id, scroll = false, behavior = animation()) {
    if (!ids.includes(id)) return;
    tabs.forEach(tab => {
      const selected = tab.dataset.noteTab === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    notePanels.forEach(panel => { panel.hidden = panel.dataset.notePanel !== id; });
    relatedNotes.forEach(link => { link.hidden = link.dataset.relatedNote !== id; });
    selectedNote = id;
    document.querySelectorAll('[data-note-link]').forEach(link => {
      if (link.dataset.noteLink === id) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    if (scroll) {
      const panel = notePanels.find(panel => panel.dataset.notePanel === id);
      panel?.focus({ preventScroll: true });
      panel?.scrollIntoView({ behavior, block: 'start' });
    }
  }
  function noteNavigation(id, scroll = false, push = false) {
    const url = new URL(location.href);
    url.hash = id;
    if (push && url.href !== location.href) {
      // Record the note being left even when it was reached by scrolling.
      if (!ids.includes(location.hash.slice(1))) {
        const previousURL = new URL(location.href);
        previousURL.hash = selectedNote;
        history.replaceState(history.state, '', previousURL);
      }
      history.pushState(history.state, '', url);
    } else history.replaceState(history.state, '', url);
    selectNote(id, scroll);
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => noteNavigation(tab.dataset.noteTab));
    tab.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const steps = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
      if (!(event.key in steps)) return;
      event.preventDefault();
      const target = tabs[steps[event.key]];
      noteNavigation(target.dataset.noteTab); target.focus({ preventScroll: true });
    });
  });
  document.querySelectorAll('[data-note-link]').forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); noteNavigation(link.dataset.noteLink, true, link.dataset.noteHistory === 'push');
  }));

  function cleanupCinema() {
    if (activeFilm === null && !document.body.classList.contains('av-viewing')) return;
    for (const panel of panels) {
      panel.setAttribute('aria-hidden', 'true'); panel.hidden = true;
      const video = panel.querySelector('video');
      if (window.ProgressiveVideo?.isSwitching(video)) window.ProgressiveVideo.setIntent(video, { paused: true, muted: true });
      video.pause(); video.muted = true;
    }
    activeFilm = null;
    pendingInitialPlay = null;
    document.body.classList.remove('av-viewing');
    announcement.textContent = '';
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    window.ProgressiveVideo?.refresh();
  }
  function hideCinema() {
    if (dialog.open) dialog.close();
    cleanupCinema();
  }
  function showFilm(id, trigger = null) {
    if (!ids.includes(id) || typeof dialog.showModal !== 'function') return false;
    const wasOpen = dialog.open;
    if (!wasOpen) returnFocus = trigger || document.querySelector(`[data-open-film="${id}"]`);
    stopPreviews();
    activeFilm = id;
    panels.forEach(panel => {
      const selected = panel.dataset.watchPanel === id;
      panel.hidden = !selected; panel.setAttribute('aria-hidden', String(!selected));
      if (!selected) {
        const video = panel.querySelector('video');
        if (window.ProgressiveVideo?.isSwitching(video)) window.ProgressiveVideo.setIntent(video, { paused: true, muted: true });
        video.pause(); video.muted = true;
      }
    });
    const panel = panelFor(id), video = panel.querySelector('video');
    if (!video.poster && video.dataset.poster) video.poster = video.dataset.poster;
    video.muted = true;
    dialog.querySelector('[data-cinema-title]').textContent = panel.querySelector('.av-watch-caption h3').textContent;
    dialog.querySelectorAll('[data-viewer-film]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.viewerFilm === id)));
    document.body.classList.add('av-viewing');
    if (!wasOpen) { dialog.showModal(); dialog.querySelector('[data-cinema-close]').focus({ preventScroll: true }); }
    // A deliberate Watch action is a playback request, even with reduced motion.
    // The preference still disables all decorative motion and hover previews.
    pendingInitialPlay = motion.matches && !playersReady ? id : null;
    if (motion.matches && playersReady) panel.querySelector('[data-player-toggle]').click();
    window.ProgressiveVideo?.refresh();
    return true;
  }
  function navigateFilm(id, trigger = null) {
    const wasOpen = dialog.open;
    if (!showFilm(id, trigger)) return false;
    const url = new URL(location.href); url.hash = `watch-${id}`;
    if (wasOpen) history.replaceState(history.state, '', url);
    else history.pushState({ avocadoCinema: true }, '', url);
    return true;
  }
  function closeCinema() {
    const ownsEntry = history.state?.avocadoCinema;
    hideCinema();
    if (ownsEntry) history.back();
    else if (location.hash.startsWith('#watch-')) {
      const url = new URL(location.href); url.hash = '';
      history.replaceState(null, '', url);
    }
  }
  const nextId = () => ids[(ids.indexOf(activeFilm) + 1) % ids.length];
  document.querySelectorAll('[data-open-film]').forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (navigateFilm(link.dataset.openFilm, link)) event.preventDefault();
  }));
  dialog.querySelector('[data-cinema-close]').addEventListener('click', closeCinema);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeCinema(); });
  dialog.addEventListener('close', cleanupCinema);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeCinema();
  });
  dialog.querySelectorAll('[data-viewer-film]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.viewerFilm !== activeFilm) navigateFilm(button.dataset.viewerFilm);
  }));
  dialog.querySelectorAll('[data-next-film]').forEach(button => button.addEventListener('click', () => navigateFilm(nextId())));
  dialog.querySelectorAll('[data-copy-film]').forEach(button => button.addEventListener('click', () => {
    const url = new URL(location.href); url.hash = `watch-${activeFilm}`; copyLink(url.href);
  }));
  const profileLink = document.querySelector('[data-profile-link]');
  const copyProfile = document.querySelector('[data-copy-profile]');
  profileLink.addEventListener('click', () => { copyProfile.hidden = false; });
  copyProfile.addEventListener('click', () => copyLink(profileLink.href));

  panels.forEach(panel => {
    const video = panel.querySelector('video'), loading = panel.querySelector('[data-loading]'), endcard = panel.querySelector('[data-endcard]');
    // A manual transport action takes precedence over the initial deep link.
    panel.querySelector('[data-player-toggle]').addEventListener('click', () => { pendingInitialPlay = null; });
    let loadingTimer;
    const clearLoading = () => { clearTimeout(loadingTimer); loading.hidden = true; };
    const showLoading = () => {
      clearTimeout(loadingTimer);
      loadingTimer = setTimeout(() => { if (dialog.open && activeFilm === panel.dataset.watchPanel && !video.ended && !video.error) loading.hidden = false; }, 550);
    };
    for (const name of ['loadstart', 'waiting', 'stalled']) video.addEventListener(name, showLoading);
    for (const name of ['playing', 'canplay', 'pause', 'error', 'ended']) video.addEventListener(name, clearLoading);
    video.addEventListener('ended', () => { endcard.hidden = false; });
    for (const name of ['play', 'seeking']) video.addEventListener(name, () => { endcard.hidden = true; });
    panel.querySelector('[data-fullscreen]').addEventListener('click', () => {
      const player = panel.querySelector('[data-workflow-player]');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (player.requestFullscreen) player.requestFullscreen().catch(() => announce(messages.unavailable));
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else announce(messages.unavailable);
    });
  });
  function syncLocation(event) {
    const hash = location.hash.slice(1);
    const film = hash.startsWith('watch-') ? hash.slice(6) : null;
    if (ids.includes(film)) { if (!dialog.open || activeFilm !== film) showFilm(film); }
    else {
      hideCinema();
      // Gallery entries share this hash; only a different note moves reading focus.
      if (ids.includes(hash)) {
        const changed = hash !== selectedNote;
        const restoring = event?.type === 'popstate';
        selectNote(hash, changed && !restoring);
        // Native Back/Forward restores the saved reading position after this event.
        if (changed && restoring) notePanels.find(panel => panel.dataset.notePanel === hash)?.focus({ preventScroll: true });
      }
    }
  }
  window.addEventListener('popstate', syncLocation);
  window.addEventListener('hashchange', syncLocation);
  window.addEventListener('pagehide', hideCinema);
  window.addEventListener('pageshow', event => { if (event.persisted) syncLocation(); });
  const initialNote = ids.includes(location.hash.slice(1)) ? location.hash.slice(1) : ids[0];
  selectNote(initialNote, ids.includes(location.hash.slice(1)), 'instant');
  syncLocation();
  document.documentElement.classList.add('av-enhanced');
})();
