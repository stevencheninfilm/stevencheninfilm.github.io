(() => {
  const groups = [...document.querySelectorAll('[data-video-loading]')];
  if (!groups.length) return;

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMedia = window.matchMedia('(max-width: 600px)');
  const READY_STATE = HTMLMediaElement.HAVE_CURRENT_DATA;
  const HINT_DELAY = 700;
  const STARTUP_TIMEOUT = 18000;

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const lightSource = () => mobileMedia.matches || connection?.saveData || /(^|-)2g$|3g/.test(connection?.effectiveType || '');
  const sourceFor = video => lightSource() && video.dataset.srcMobile
    ? video.dataset.srcMobile
    : video.dataset.src || video.getAttribute('src') || video.querySelector('source[src]')?.getAttribute('src') || '';

  groups.forEach(group => {
    const videos = [...group.querySelectorAll('video')];
    const overlay = group.querySelector(':scope > .video-loading-ui');
    const output = overlay?.querySelector('output');
    const label = overlay?.querySelector('.video-loading-meta span');
    const progressbar = overlay?.querySelector('[role="progressbar"]');
    const statusText = overlay?.querySelector('.video-loading-status');
    const retry = overlay?.querySelector('.video-loading-retry');
    const controls = [...group.querySelectorAll('.comparison-handle')];
    if (!videos.length || !overlay || !label || !statusText || !retry) return;

    const copy = group.dataset.videoLang === 'zh' ? {
      loading: group.dataset.videoLoadingLabel || '视频加载中',
      loadingStatus: '视频正在加载，可以先查看静态画面。',
      error: '视频暂时无法加载', offline: '当前离线，无法加载视频',
      errorStatus: '暂时显示静态画面。点击重试加载视频。',
      offlineStatus: '暂时显示静态画面。联网后可重试。',
      ready: '视频已就绪', staticReady: '视频静态预览已就绪',
      retry: '重试', play: '点击播放', playStatus: '点击播放视频。'
    } : {
      loading: 'LOADING VIDEO', loadingStatus: 'Video loading. The still preview is available.',
      error: 'VIDEO UNAVAILABLE', offline: 'VIDEO UNAVAILABLE OFFLINE',
      errorStatus: 'The still preview is available. Retry loading the video.',
      offlineStatus: 'The still preview is available. Retry when connected.',
      ready: 'Video ready', staticReady: 'Static video preview ready',
      retry: 'Retry', play: 'Play video', playStatus: 'Press Play to start the video.'
    };
    const homeCard = group.closest('.deck-card--comparison');
    const homeDeck = homeCard?.closest('.project-deck');
    const originalSources = new Map(videos.map(video => [video, sourceFor(video)]));
    const resumeTimes = new Map();
    let phase = 'idle', action = 'retry', inView = !('IntersectionObserver' in window);
    let run = 0, hintTimer = 0, deadlineTimer = 0, focusTimer = 0;
    let settingSources = false, restoreFocusAfterRetry = false;

    const visible = () => !document.hidden && (homeCard
      ? homeDeck && !homeDeck.classList.contains('is-strip') &&
        (homeCard.classList.contains('is-active') || homeCard.classList.contains('is-slide-layer'))
      : inView);
    const staticOnly = () => group.hasAttribute('data-video-static-on-reduced-motion') && motionPreference.matches;
    const markReady = ready => videos.forEach(video => { video.dataset.videoLoaderReady = String(ready); });
    const clearTimers = () => {
      window.clearTimeout(hintTimer);
      window.clearTimeout(deadlineTimer);
      window.clearTimeout(focusTimer);
    };
    const hide = announcement => {
      overlay.hidden = true;
      statusText.textContent = announcement || '';
    };
    const restoreFocus = () => {
      if (!restoreFocusAfterRetry || !visible()) return;
      restoreFocusAfterRetry = false;
      const target = controls[0] || group.closest('.project-feature')?.querySelector('h2');
      if (!target) return;
      const addedTabIndex = !target.hasAttribute('tabindex');
      if (addedTabIndex) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      if (addedTabIndex) target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    };
    const showPlay = () => {
      if (!visible() || phase !== 'ready') return;
      action = 'play';
      label.textContent = copy.playStatus;
      statusText.textContent = copy.playStatus;
      retry.textContent = copy.play;
      retry.hidden = false;
      overlay.classList.remove('is-ready', 'is-error');
      overlay.hidden = false;
    };
    const resumeAutoplay = () => {
      if (!visible() || staticOnly()) return;
      // Homepage comparison playback remains owned by its synchronization controller.
      videos.filter(video => video.autoplay).forEach(video => {
        video.play().catch(showPlay);
      });
    };
    const finish = () => {
      if (phase === 'idle' || phase === 'static' || settingSources) return;
      clearTimers();
      phase = 'ready';
      markReady(true);
      retry.hidden = true;
      overlay.classList.remove('is-error');
      overlay.classList.add('is-ready');
      hide(copy.ready);
      videos.forEach(video => video.dispatchEvent(new CustomEvent('video-loader:ready')));
      restoreFocus();
      resumeAutoplay();
    };
    const checkReady = () => {
      if ((phase === 'loading' || phase === 'error') && videos.every(video => video.readyState >= READY_STATE)) finish();
    };
    const showError = () => {
      if (phase === 'idle' || phase === 'static' || settingSources) return;
      clearTimers();
      phase = 'error';
      markReady(false);
      videos.forEach(video => video.pause());
      action = 'retry';
      label.textContent = navigator.onLine ? copy.error : copy.offline;
      statusText.textContent = navigator.onLine ? copy.errorStatus : copy.offlineStatus;
      retry.textContent = copy.retry;
      retry.hidden = false;
      overlay.classList.remove('is-ready');
      overlay.classList.add('is-error');
      overlay.hidden = !visible();
      if (restoreFocusAfterRetry && visible()) {
        focusTimer = window.setTimeout(() => {
          if (phase === 'error' && visible()) retry.focus({ preventScroll: true });
        }, 60);
      }
    };
    const cancelPending = (nextPhase = 'idle') => {
      ++run;
      clearTimers();
      markReady(false);
      phase = nextPhase;
      // Removing the source and loading an empty media element cancels native
      // range requests. Keep the URL and playback position for the next visit.
      videos.forEach(video => {
        if (video.readyState >= 1 && Number.isFinite(video.currentTime)) resumeTimes.set(video, video.currentTime);
        video.pause();
        video.preload = 'none';
        video.removeAttribute('src');
        video.load();
      });
      hide();
    };
    const start = (reload = false) => {
      if (!visible()) return;
      if (staticOnly()) {
        if (phase === 'loading' || phase === 'error') cancelPending('static');
        else { phase = 'static'; markReady(false); videos.forEach(video => video.pause()); }
        hide(copy.staticReady);
        return;
      }
      if (phase === 'loading' && !reload) return;
      if (!reload && videos.every(video => video.readyState >= READY_STATE)) {
        phase = 'loading';
        finish();
        return;
      }
      const currentRun = ++run;
      clearTimers();
      phase = 'loading';
      action = 'retry';
      markReady(false);
      overlay.classList.remove('is-ready', 'is-error');
      retry.hidden = true;
      retry.textContent = copy.retry;
      label.textContent = copy.loading;
      hide(copy.loadingStatus);
      const sources = videos.map(video => sourceFor(video) || originalSources.get(video));
      if (sources.some(url => !url)) { showError(); return; }
      hintTimer = window.setTimeout(() => {
        if (run === currentRun && phase === 'loading' && visible()) overlay.hidden = false;
      }, HINT_DELAY);
      deadlineTimer = window.setTimeout(() => {
        if (run === currentRun && phase === 'loading') showError();
      }, STARTUP_TIMEOUT);
      settingSources = true;
      videos.forEach((video, index) => {
        video.muted = true;
        video.preload = 'auto';
        video.src = sources[index];
        video.load();
      });
      settingSources = false;
      checkReady();
    };
    const update = () => {
      if (!visible()) {
        if (phase === 'loading') cancelPending();
        else if (phase === 'error') cancelPending('error');
        else videos.forEach(video => video.pause());
        return;
      }
      if (phase === 'error') { overlay.hidden = false; return; }
      if (phase === 'idle' || phase === 'static') start();
      else if (phase === 'ready') resumeAutoplay();
    };

    // Browser range buffering has no meaningful whole-file percentage. Keep the
    // poster and reveal control available while a small, delayed status explains loading.
    overlay.classList.add('is-progressive');
    overlay.hidden = true;
    if (output) { output.hidden = true; output.textContent = ''; }
    if (progressbar) { progressbar.hidden = true; progressbar.removeAttribute('aria-valuenow'); }
    controls.forEach(control => { control.disabled = false; control.setAttribute('aria-disabled', 'false'); });
    videos.forEach(video => {
      video.dataset.videoLoaderManaged = 'true';
      video.dataset.videoLoaderReady = 'false';
      video.addEventListener('loadedmetadata', () => {
        const position = resumeTimes.get(video);
        if (position !== undefined && phase === 'loading') {
          resumeTimes.delete(video);
          const end = Number.isFinite(video.duration) ? Math.max(0, video.duration - .08) : position;
          video.currentTime = Math.min(position, end);
        }
        checkReady();
      });
      ['loadeddata', 'canplay', 'playing'].forEach(event => video.addEventListener(event, checkReady));
      video.addEventListener('error', showError);
    });
    group.addEventListener('video-loader:play-blocked', showPlay);
    retry.addEventListener('click', () => {
      if (!visible()) return;
      if (action === 'play') {
        hide(copy.ready);
        if (homeCard) videos.forEach(video => video.dispatchEvent(new CustomEvent('video-loader:play')));
        else videos.forEach(video => video.play().catch(showPlay));
      } else {
        restoreFocusAfterRetry = true;
        start(true);
      }
    });
    motionPreference.addEventListener('change', () => {
      if (staticOnly()) {
        if (phase === 'loading' || phase === 'error') cancelPending('static');
        else { phase = 'static'; markReady(false); videos.forEach(video => video.pause()); }
        hide(copy.staticReady);
      } else update();
    });
    window.addEventListener('pagehide', () => {
      if (phase === 'loading') cancelPending();
      else videos.forEach(video => video.pause());
    });
    window.addEventListener('pageshow', event => {
      if (!event.persisted) return;
      if (phase === 'ready' && visible()) {
        videos.forEach(video => video.dispatchEvent(new CustomEvent('video-loader:ready')));
        resumeAutoplay();
      } else update();
    });
    document.addEventListener('visibilitychange', update);
    if (homeCard && homeDeck) {
      const observer = new MutationObserver(update);
      observer.observe(homeCard, { attributes: true, attributeFilter: ['class'] });
      observer.observe(homeDeck, { attributes: true, attributeFilter: ['class'] });
    } else if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        update();
      }, { threshold: 0, rootMargin: '160px 0px' }).observe(group);
    }
    update();
  });
})();
