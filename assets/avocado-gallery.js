(() => {
  'use strict';
  const dialog = document.querySelector('[data-lightbox]');
  const links = [...document.querySelectorAll('[data-gallery-item]')];
  if (!dialog || !links.length || typeof dialog.showModal !== 'function') return;
  const image = dialog.querySelector('[data-lightbox-image]');
  const title = dialog.querySelector('[data-lightbox-title]');
  const caption = dialog.querySelector('[data-lightbox-caption]');
  const count = dialog.querySelector('[data-lightbox-count]');
  const loading = dialog.querySelector('[data-lightbox-loading]');
  const progress = dialog.querySelector('[data-lightbox-progress]');
  const percent = dialog.querySelector('[data-lightbox-percent]');
  const error = dialog.querySelector('[data-lightbox-error]');
  const direct = dialog.querySelector('[data-lightbox-direct]');
  const previous = dialog.querySelector('[data-lightbox-prev]');
  const next = dialog.querySelector('[data-lightbox-next]');
  const close = dialog.querySelector('[data-lightbox-close]');
  const stage = dialog.querySelector('[data-lightbox-stage]');
  let items = [], index = -1, generation = 0, loadingTimer, returnFocus = null, swipe = null;
  let activeLoad = null, suppressClick = false;
  let activeEntry = null, closingEntry = null, queuedOpen = null, entrySequence = 0;
  const historyKey = 'avocadoGallery';

  function historySelection() {
    const marker = history.state?.[historyKey];
    if (marker?.version !== 1 || typeof marker.entry !== 'string' || !marker.entry || !Number.isInteger(marker.index)) return null;
    const group = links.filter(link => link.dataset.gallery === marker.group);
    return group[marker.index] ? { marker, item: group[marker.index] } : null;
  }
  function rememberSelection() {
    const selected = historySelection();
    if (!activeEntry || selected?.marker.entry !== activeEntry) return;
    const group = items[index].dataset.gallery;
    if (selected.marker.group === group && selected.marker.index === index) return;
    history.replaceState({ ...history.state, [historyKey]: { ...selected.marker, group, index } }, '', location.href);
  }

  function releaseImage() {
    const old = activeLoad;
    activeLoad = null;
    if (old?.xhr) old.xhr.abort();
    if (old?.decoder) {
      old.decoder.onload = old.decoder.onerror = null;
      old.decoder.src = '';
    }
    image.removeAttribute('src');
    if (old?.objectURL) URL.revokeObjectURL(old.objectURL);
  }
  function setProgress(loaded, total) {
    const known = Number.isFinite(total) && total > 0 && Number.isFinite(loaded) && loaded >= 0;
    if (known) {
      const value = Math.min(100, loaded / total * 100);
      if (progress) progress.value = value;
      if (percent) percent.textContent = `${Math.floor(value)}%`;
    } else {
      progress?.removeAttribute('value');
      if (percent) percent.textContent = '';
    }
  }

  function show(indexToShow, retry = false) {
    if (!dialog.open || closingEntry) return;
    const target = Math.max(0, Math.min(items.length - 1, indexToShow));
    if (target === index && !retry) return;
    index = target;
    const item = items[index];
    if (!item) return;
    rememberSelection();
    const current = ++generation;
    clearTimeout(loadingTimer);
    releaseImage();
    setProgress(null, null);
    image.hidden = true;
    loading.hidden = true;
    error.hidden = true;
    title.textContent = item.dataset.galleryTitle;
    caption.textContent = item.dataset.caption;
    count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
    previous.disabled = index === 0;
    next.disabled = index === items.length - 1;
    const url = new URL(item.href, location.href);
    if (retry) url.searchParams.set('retry', String(Date.now()));
    direct.href = url.href;
    loadingTimer = setTimeout(() => { if (current === generation && dialog.open) loading.hidden = false; }, 250);
    // The selected still alone uses the normal HTTP cache. Its transfer reports
    // real byte progress; a completed download stays visible until image decode.
    const load = { xhr: null, decoder: null, objectURL: null };
    activeLoad = load;
    const isCurrent = () => current === generation && dialog.open && activeLoad === load;
    const fail = () => {
      if (!isCurrent()) return;
      clearTimeout(loadingTimer);
      releaseImage();
      loading.hidden = true;
      error.hidden = false;
    };
    try {
      const xhr = new XMLHttpRequest();
      load.xhr = xhr;
      xhr.open('GET', url.href, true);
      xhr.responseType = 'blob';
      xhr.timeout = 45000;
      xhr.onprogress = event => {
        if (isCurrent()) setProgress(event.loaded, event.lengthComputable ? event.total : null);
      };
      xhr.onerror = xhr.ontimeout = fail;
      xhr.onload = () => {
        if (!isCurrent()) return;
        load.xhr = null;
        if (xhr.status < 200 || xhr.status >= 300 || !xhr.response?.size) { fail(); return; }
        try {
          load.objectURL = URL.createObjectURL(xhr.response);
          const pending = new Image();
          load.decoder = pending;
          pending.onload = () => {
            if (!isCurrent()) return;
            clearTimeout(loadingTimer);
            load.decoder = null;
            image.alt = item.dataset.caption;
            image.src = load.objectURL;
            image.hidden = false;
            loading.hidden = true;
          };
          pending.onerror = fail;
          pending.src = load.objectURL;
        } catch (_) { fail(); }
      };
      xhr.send();
    } catch (_) { fail(); }
  }

  function open(item, restored = null) {
    if (closingEntry) { queuedOpen = item; return true; }
    if (dialog.open && items.includes(item) && (!restored || restored.entry === activeEntry)) {
      show(items.indexOf(item));
      return true;
    }
    const selected = historySelection();
    if (!restored && dialog.open && selected?.marker.entry === activeEntry) restored = selected.marker;
    if (dialog.open) { returnFocus = null; hide(); }
    items = links.filter(link => link.dataset.gallery === item.dataset.gallery);
    index = -1;
    returnFocus = item;
    try { dialog.showModal(); } catch (_) { return false; }
    activeEntry = restored?.entry || `${Date.now()}-${++entrySequence}`;
    if (!restored) {
      history.pushState({ ...history.state, [historyKey]: {
        version: 1, entry: activeEntry, group: item.dataset.gallery, index: items.indexOf(item)
      } }, '', location.href);
    }
    suppressClick = false;
    document.body.classList.add('av-lightbox-open');
    document.dispatchEvent(new Event('avocado:galleryopen'));
    show(items.indexOf(item));
    close.focus({ preventScroll: true });
    return true;
  }
  function cleanup() {
    generation++;
    clearTimeout(loadingTimer);
    swipe = null;
    suppressClick = false;
    releaseImage();
    setProgress(null, null);
    image.alt = '';
    image.hidden = true;
    loading.hidden = true;
    error.hidden = true;
    document.body.classList.remove('av-lightbox-open');
    const target = returnFocus;
    returnFocus = null;
    activeEntry = null;
    items = [];
    index = -1;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }
  function hide() {
    if (dialog.open) dialog.close();
    cleanup();
  }
  function dismiss() {
    if (closingEntry) return;
    const selected = historySelection();
    if (activeEntry && selected?.marker.entry === activeEntry) {
      // Some restored browser sessions keep only their current entry. There is
      // no predecessor to traverse in that case, so remove only our own marker.
      if (history.length <= 1) {
        const state = { ...history.state };
        delete state[historyKey];
        history.replaceState(state, '', location.href);
        hide();
        return;
      }
      // Keep the background inert until traversal finishes, so a notes click
      // cannot overwrite the history entry while Back is still in flight.
      closingEntry = activeEntry;
      history.back();
    } else hide();
  }
  function syncHistory() {
    const selected = historySelection();
    if (closingEntry && selected?.marker.entry === closingEntry) return;
    closingEntry = null;
    const queued = queuedOpen;
    queuedOpen = null;
    if (selected) open(selected.item, selected.marker);
    else hide();
    if (queued) open(queued);
  }
  links.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (open(link)) event.preventDefault();
  }));
  previous.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  close.addEventListener('click', dismiss);
  dialog.querySelector('[data-lightbox-retry]').addEventListener('click', () => show(index, true));
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('close', () => { if (!dialog.open) cleanup(); });
  dialog.addEventListener('keydown', event => {
    const steps = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: items.length - 1 };
    if (!dialog.open || !(event.key in steps)) return;
    event.preventDefault();
    show(steps[event.key]);
  });
  function onImage(clientX, clientY) {
    if (image.hidden || !image.naturalWidth || !image.naturalHeight) return false;
    const box = image.getBoundingClientRect();
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    const left = box.left + (box.width - width) / 2, top = box.top + (box.height - height) / 2;
    return clientX >= left && clientX <= left + width && clientY >= top && clientY <= top + height;
  }
  const interactive = target => target?.closest?.('button,a,input,select,textarea');
  dialog.addEventListener('pointerdown', event => {
    if (event.target === dialog) suppressClick = false;
  });
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary) { swipe = null; suppressClick = true; return; }
    if ((event.button !== undefined && event.button !== 0) || interactive(event.target)) return;
    suppressClick = false;
    swipe = { x: event.clientX, y: event.clientY, id: event.pointerId, touch: event.pointerType === 'touch', moved: false, onImage: onImage(event.clientX, event.clientY) };
    if (swipe.touch) stage.setPointerCapture?.(event.pointerId);
  });
  dialog.addEventListener('pointermove', event => {
    if (swipe?.id === event.pointerId && Math.hypot(event.clientX - swipe.x, event.clientY - swipe.y) > 8) swipe.moved = true;
  });
  dialog.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    const touch = swipe.touch;
    suppressClick = swipe.moved || Math.hypot(dx, dy) > 8 || swipe.onImage;
    swipe = null;
    if (touch && Math.abs(dx) >= 50 && Math.abs(dy) < Math.abs(dx) * .65) show(index + (dx < 0 ? 1 : -1));
  });
  dialog.addEventListener('pointercancel', () => { swipe = null; suppressClick = true; });
  dialog.addEventListener('click', event => {
    if (!dialog.open || interactive(event.target)) return;
    if (![stage, image, dialog].includes(event.target)) return;
    if (suppressClick) { suppressClick = false; return; }
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    if (!onImage(event.clientX, event.clientY)) dismiss();
  });
  window.addEventListener('popstate', syncHistory);
  window.addEventListener('pagehide', () => {
    closingEntry = null;
    queuedOpen = null;
    returnFocus = null;
    hide();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) syncHistory(); });
  syncHistory();
})();
