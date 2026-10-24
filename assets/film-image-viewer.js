(() => {
  'use strict';

  const projectDialog = document.querySelector('.film-page #project-dialog');
  if (!projectDialog) return;

  const viewer = document.createElement('dialog');
  viewer.className = 'film-still-viewer';
  viewer.setAttribute('aria-label', 'Full-screen film still');
  viewer.innerHTML = '<button class="film-still-viewer__close" type="button" aria-label="Close full-screen image" autofocus>Close ×</button><img class="film-still-viewer__image" alt=""><p class="film-still-viewer__hint">Click anywhere to close <span aria-hidden="true">·</span> Esc</p>';
  document.body.appendChild(viewer);

  const image = viewer.querySelector('img');
  let returnFocus = null;
  let projectScrollTop = 0;

  function closeViewer(restorePosition = true) {
    if (!viewer.open) return;
    viewer.close();
    document.documentElement.classList.remove('film-still-viewing');
    image.removeAttribute('src');
    image.alt = '';
    if (restorePosition && projectDialog.open) {
      projectDialog.scrollTop = projectScrollTop;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
    returnFocus = null;
  }

  function openViewer(trigger) {
    const source = trigger.querySelector('img');
    if (!source || viewer.open) return;
    returnFocus = trigger;
    projectScrollTop = projectDialog.scrollTop;
    image.src = source.dataset.fullSrc || source.currentSrc || source.src;
    image.alt = source.alt;
    document.documentElement.classList.add('film-still-viewing');
    viewer.showModal();
  }

  function enhanceStills() {
    closeViewer(false);
    projectDialog.querySelectorAll('.dialog-hero img, .dialog-gallery img').forEach(still => {
      let trigger = still.closest('.film-still-trigger');
      if (!trigger) {
        trigger = document.createElement('button');
        still.before(trigger);
        trigger.appendChild(still);
      }
      trigger.type = 'button';
      trigger.className = 'film-still-trigger';
      trigger.setAttribute('aria-label', `View ${still.alt || 'film still'} full screen`);
      trigger.setAttribute('aria-haspopup', 'dialog');
    });
  }

  projectDialog.addEventListener('click', event => {
    const trigger = event.target.closest('.film-still-trigger');
    if (trigger) openViewer(trigger);
  });
  viewer.addEventListener('click', () => closeViewer());
  viewer.addEventListener('cancel', event => {
    event.preventDefault();
    event.stopPropagation();
    closeViewer();
  });
  document.addEventListener('portfolio:project-ready', enhanceStills);
  document.addEventListener('portfolio:project-closed', () => closeViewer(false));
  enhanceStills();
})();
