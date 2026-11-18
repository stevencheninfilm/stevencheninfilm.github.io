(() => {
  'use strict';

  const dialog = document.getElementById('viewer');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  const stage = document.getElementById('viewer-stage');
  const title = document.getElementById('viewer-title');
  const closeButton = document.getElementById('viewer-close');
  const original = document.getElementById('viewer-original');
  if (!stage || !title || !closeButton || !original) return;

  let trigger;
  let currentMedia;

  function showError() {
    if (this !== currentMedia) return;
    const message = document.createElement('p');
    message.setAttribute('role', 'status');
    message.textContent = '媒体加载失败，可以使用下方链接打开原文件。';
    stage.replaceChildren(message);
  }

  function openFilm(link) {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', title.textContent);
    if (link.dataset.poster) video.poster = link.dataset.poster;
    const start = Number(link.dataset.time);
    if (Number.isFinite(start) && start > 0) {
      video.addEventListener('loadedmetadata', () => {
        if (currentMedia === video && Number.isFinite(video.duration)) {
          video.currentTime = Math.min(start, video.duration);
        }
      }, { once: true });
    }
    currentMedia = video;
    video.addEventListener('error', showError, { once: true });
    stage.replaceChildren(video);
    const useMobile = window.matchMedia('(max-width: 767px)').matches || navigator.connection?.saveData;
    video.src = useMobile && link.dataset.mobile ? link.dataset.mobile : link.href;
    // Request playback while the user's click still grants audio activation.
    // If autoplay is disabled, native controls remain available.
    video.play()?.catch(() => {});
  }

  function openArt(link) {
    const image = document.createElement('img');
    const alt = link.querySelector('img')?.alt;
    image.alt = alt || title.textContent;
    currentMedia = image;
    image.addEventListener('error', showError, { once: true });
    stage.replaceChildren(image);
    image.src = link.href;
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
        event.shiftKey || event.altKey || dialog.open) return;
    const link = event.target.closest?.('a[href][data-film], a[href][data-art]');
    if (!link) return;

    dialog.showModal();
    event.preventDefault();
    trigger = link;
    const film = link.hasAttribute('data-film');
    title.textContent = link.dataset.title || (film ? '广告成片' : '平面作品');
    original.href = link.href;
    dialog.dataset.mode = film ? 'film' : 'art';
    closeButton.focus({ preventScroll: true });
    if (film) openFilm(link);
    else openArt(link);
  });

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    const media = currentMedia;
    currentMedia = null;
    if (media) {
      media.removeEventListener('error', showError);
      if (media.tagName === 'VIDEO') {
        media.pause();
        media.removeAttribute('src');
        media.load();
      } else {
        media.removeAttribute('src');
      }
    }
    stage.replaceChildren();
    original.removeAttribute('href');
    delete dialog.dataset.mode;
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    trigger = null;
  });

  function isBackdrop(event) {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right ||
           event.clientY < bounds.top || event.clientY > bounds.bottom;
  }

  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    pressedBackdrop = isBackdrop(event);
  });
  dialog.addEventListener('click', (event) => {
    if (pressedBackdrop && isBackdrop(event)) dialog.close();
    pressedBackdrop = false;
  });

  function pauseVideo() {
    if (currentMedia?.tagName === 'VIDEO') currentMedia.pause();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseVideo();
  });
  window.addEventListener('pagehide', pauseVideo);
})();
