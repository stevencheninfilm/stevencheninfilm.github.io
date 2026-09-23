(() => {
  const groups = [...document.querySelectorAll('[data-video-loading]')];
  if (!groups.length) return;

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMedia = window.matchMedia('(max-width: 600px)');
  const READY_STATE = HTMLMediaElement.HAVE_FUTURE_DATA;
  const HIDE_DELAY = 500;

  const sourceFor = (video) => {
    if (mobileMedia.matches && video.dataset.srcMobile) return video.dataset.srcMobile;
    return video.dataset.src || video.getAttribute('src') || video.querySelector('source[src]')?.getAttribute('src') || '';
  };

  groups.forEach((group) => {
    const videos = [...group.querySelectorAll('video')];
    const overlay = group.querySelector(':scope > .video-loading-ui');
    const output = overlay?.querySelector('output');
    const label = overlay?.querySelector('.video-loading-meta span');
    const progressbar = overlay?.querySelector('[role="progressbar"]');
    const statusText = overlay?.querySelector('.video-loading-status');
    const retry = overlay?.querySelector('.video-loading-retry');
    const controls = [...group.querySelectorAll('.comparison-handle')];
    if (!videos.length || !overlay || !output || !label || !progressbar || !statusText || !retry) return;

    // Opt-in localization keeps existing English pages unchanged.
    const copy = group.dataset.videoLang === 'zh' ? {
      loading: '预告片加载中', loadingStatus: '视频正在加载',
      error: '视频暂时无法加载', offline: '当前离线，无法加载视频',
      errorStatus: '视频加载失败，请重试。', offlineStatus: '当前处于离线状态，请联网后重试。',
      ready: '视频已就绪', staticReady: '视频静态预览已就绪'
    } : {
      loading: 'LOADING VIDEO', loadingStatus: 'Video loading',
      error: 'VIDEO UNAVAILABLE', offline: 'VIDEO UNAVAILABLE OFFLINE',
      errorStatus: 'Video unavailable. Retry loading.', offlineStatus: 'Video unavailable offline. Retry when connected.',
      ready: 'Video ready', staticReady: 'Static video preview ready'
    };

    const transfers = new Map(videos.map((video) => [video, {
      complete: false,
      loaded: 0,
      objectUrl: '',
      total: 0,
      xhr: null
    }]));
    let finished = false;
    let loadRun = 0;
    let readyTimer = 0;
    let hideTimer = 0;
    let retryFocusTimer = 0;
    let restoreFocusAfterRetry = false;

    videos.forEach((video) => {
      video.dataset.videoLoaderManaged = 'true';
    });

    const setControlsDisabled = (disabled) => {
      controls.forEach((control) => {
        control.disabled = disabled;
        control.setAttribute('aria-disabled', String(disabled));
      });
    };

    const setProgress = (value) => {
      const percent = Math.max(0, Math.min(100, Math.round(value)));
      overlay.style.setProperty('--video-load-progress', String(percent / 100));
      output.textContent = `${percent}%`;
      progressbar.setAttribute('aria-valuenow', String(percent));
    };

    const renderTransfer = () => {
      const items = [...transfers.values()];
      const totalsKnown = items.every((item) => item.total > 0);
      if (totalsKnown) {
        const loaded = items.reduce((sum, item) => sum + item.loaded, 0);
        const total = items.reduce((sum, item) => sum + item.total, 0);
        setProgress(Math.min(98, (loaded / total) * 98));
        return;
      }

      const completed = items.filter((item) => item.complete).length;
      setProgress(Math.min(92, (completed / items.length) * 92));
    };

    const showLoading = () => {
      window.clearTimeout(readyTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(retryFocusTimer);
      finished = false;
      overlay.hidden = false;
      overlay.classList.remove('is-ready', 'is-error');
      label.textContent = copy.loading;
      retry.hidden = true;
      statusText.textContent = copy.loadingStatus;
      setControlsDisabled(true);
    };

    const showError = () => {
      window.clearTimeout(readyTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(retryFocusTimer);
      finished = true;
      videos.forEach((video) => video.pause());
      overlay.hidden = false;
      overlay.classList.remove('is-ready');
      overlay.classList.add('is-error');
      label.textContent = navigator.onLine ? copy.error : copy.offline;
      retry.hidden = false;
      statusText.textContent = navigator.onLine ? copy.errorStatus : copy.offlineStatus;
      setControlsDisabled(true);
      if (restoreFocusAfterRetry) {
        retryFocusTimer = window.setTimeout(() => {
          if (!retry.hidden && overlay.classList.contains('is-error')) retry.focus({ preventScroll: true });
        }, 60);
      }
    };

    const hideAsReady = (announcement = copy.ready) => {
      window.clearTimeout(readyTimer);
      window.clearTimeout(hideTimer);
      finished = true;
      setProgress(100);
      overlay.classList.remove('is-error');
      overlay.classList.add('is-ready');
      overlay.hidden = true;
      statusText.textContent = announcement;
      setControlsDisabled(false);
    };

    const announceReady = () => {
      videos.forEach((video) => video.dispatchEvent(new CustomEvent('video-loader:ready')));
    };

    const restoreFocus = () => {
      if (!restoreFocusAfterRetry) return;
      restoreFocusAfterRetry = false;
      const target = controls[0] || group.closest('.project-feature')?.querySelector('h2');
      if (!target) return;
      const addedTabIndex = !target.hasAttribute('tabindex');
      if (addedTabIndex) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      if (addedTabIndex) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      setProgress(100);
      statusText.textContent = copy.ready;
      setControlsDisabled(false);
      announceReady();
      restoreFocus();
      readyTimer = window.setTimeout(() => overlay.classList.add('is-ready'), 90);
      hideTimer = window.setTimeout(() => {
        overlay.hidden = true;
      }, HIDE_DELAY);
    };

    const abortTransfers = () => {
      transfers.forEach((item) => {
        if (item.xhr) item.xhr.abort();
        item.xhr = null;
      });
    };

    const waitForPlayable = (video, run) => {
      if (video.readyState >= READY_STATE) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          video.removeEventListener('canplay', onReady);
          video.removeEventListener('error', onError);
        };
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Video decoding failed'));
        };
        if (run !== loadRun) {
          resolve();
          return;
        }
        video.addEventListener('canplay', onReady, { once: true });
        video.addEventListener('error', onError, { once: true });
      });
    };

    const download = (video, url, run) => new Promise((resolve, reject) => {
      const item = transfers.get(video);
      const xhr = new XMLHttpRequest();
      item.xhr = xhr;
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.addEventListener('progress', (event) => {
        if (run !== loadRun) return;
        item.loaded = event.loaded;
        if (event.lengthComputable && event.total > 0) item.total = event.total;
        renderTransfer();
      });
      xhr.addEventListener('load', () => {
        if (run !== loadRun) return;
        if (xhr.status < 200 || xhr.status >= 300 || !(xhr.response instanceof Blob)) {
          reject(new Error(`Video request failed with ${xhr.status}`));
          return;
        }
        item.loaded = xhr.response.size;
        item.total = xhr.response.size;
        item.complete = true;
        item.xhr = null;
        renderTransfer();
        resolve(xhr.response);
      });
      xhr.addEventListener('error', () => reject(new Error('Video request failed')));
      xhr.addEventListener('abort', () => {
        if (run === loadRun) reject(new DOMException('Loading aborted', 'AbortError'));
      });
      xhr.send();
    });

    const loadDirectly = async (video, url, run) => {
      if (run !== loadRun) return;
      video.src = url;
      video.load();
      await waitForPlayable(video, run);
    };

    const start = async (reload = false) => {
      abortTransfers();
      const run = ++loadRun;

      if (group.hasAttribute('data-video-static-on-reduced-motion') && motionPreference.matches) {
        videos.forEach((video) => video.pause());
        hideAsReady(copy.staticReady);
        return;
      }

      if (!reload && videos.every((video) => video.readyState >= READY_STATE)) {
        hideAsReady();
        announceReady();
        videos.forEach((video) => {
          if (video.autoplay) video.play().catch(() => {});
        });
        return;
      }

      transfers.forEach((item) => {
        item.complete = false;
        item.loaded = 0;
        item.total = 0;
      });
      setProgress(0);
      showLoading();

      const sources = videos.map(sourceFor);
      if (sources.some((source) => !source)) {
        showError();
        return;
      }

      try {
        if (location.protocol === 'file:') {
          await Promise.all(videos.map((video, index) => loadDirectly(video, sources[index], run)));
        } else {
          const blobs = await Promise.all(videos.map((video, index) => download(video, sources[index], run)));
          if (run !== loadRun) return;
          setProgress(99);
          videos.forEach((video, index) => {
            const item = transfers.get(video);
            if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
            item.objectUrl = URL.createObjectURL(blobs[index]);
            video.src = item.objectUrl;
            video.load();
          });
          await Promise.all(videos.map((video) => waitForPlayable(video, run)));
        }

        if (run !== loadRun) return;
        finish();
        videos.forEach((video) => {
          if (video.autoplay) video.play().catch(() => {});
        });
      } catch (error) {
        if (error?.name === 'AbortError' || run !== loadRun) return;
        abortTransfers();
        showError();
      }
    };

    videos.forEach((video) => video.addEventListener('error', showError));
    retry.addEventListener('click', () => {
      restoreFocusAfterRetry = true;
      start(true);
    });
    motionPreference.addEventListener('change', () => start(false));
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      if (videos.every((video) => video.readyState >= READY_STATE)) {
        hideAsReady();
        announceReady();
      } else {
        start(false);
      }
    });

    start(false);
  });
})();
