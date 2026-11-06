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
  const error = dialog.querySelector('[data-lightbox-error]');
  const direct = dialog.querySelector('[data-lightbox-direct]');
  const previous = dialog.querySelector('[data-lightbox-prev]');
  const next = dialog.querySelector('[data-lightbox-next]');
  const close = dialog.querySelector('[data-lightbox-close]');
  const stage = dialog.querySelector('[data-lightbox-stage]');
  let items = [], index = 0, generation = 0, loadingTimer, returnFocus = null, swipe = null;

  function show(indexToShow, retry = false) {
    index = Math.max(0, Math.min(items.length - 1, indexToShow));
    const item = items[index];
    if (!item) return;
    const current = ++generation;
    clearTimeout(loadingTimer);
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
    // Only the selected full-size still is requested. A generation token stops
    // a slow earlier image from replacing a newer selection.
    const pending = new Image();
    pending.onload = () => {
      if (current !== generation || !dialog.open) return;
      clearTimeout(loadingTimer);
      image.alt = item.dataset.caption;
      image.src = url.href;
      image.hidden = false;
      loading.hidden = true;
    };
    pending.onerror = () => {
      if (current !== generation || !dialog.open) return;
      clearTimeout(loadingTimer);
      loading.hidden = true;
      error.hidden = false;
    };
    pending.src = url.href;
  }

  function open(item) {
    items = links.filter(link => link.dataset.gallery === item.dataset.gallery);
    returnFocus = item;
    try { dialog.showModal(); } catch (_) { return false; }
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
    image.removeAttribute('src');
    image.alt = '';
    image.hidden = true;
    loading.hidden = true;
    error.hidden = true;
    document.body.classList.remove('av-lightbox-open');
    const target = returnFocus;
    returnFocus = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }
  function dismiss() {
    if (dialog.open) dialog.close();
    cleanup();
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
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    if (event.target?.closest?.('button,a,input,select,textarea')) return;
    swipe = { x: event.clientX, y: event.clientY, id: event.pointerId };
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) >= 50 && Math.abs(dy) < Math.abs(dx) * .65) show(index + (dx < 0 ? 1 : -1));
  });
  stage.addEventListener('pointercancel', () => { swipe = null; });
  window.addEventListener('pagehide', () => { returnFocus = null; dismiss(); });
})();
