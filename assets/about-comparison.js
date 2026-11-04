(() => {
  const initialize = stage => {
    const frame = stage.querySelector('.ab-compare__frame');
    const handle = stage.querySelector('.ab-compare__handle');
    const toggle = stage.querySelector('.ab-compare__play');
    const status = stage.querySelector('.ab-compare__status');
    const before = stage.querySelector('.ab-compare__before');
    const after = stage.querySelector('.ab-compare__after video');
    if (!frame || !handle || !toggle || !status || !before || !after) return;

    const workflowPanel = stage.closest?.('[data-workflow-item]');
    const languageContext = stage.closest?.('[lang], [data-video-lang]');
    const language = languageContext?.dataset.videoLang || languageContext?.getAttribute('lang') || stage.dataset.videoLang || document.documentElement?.lang || 'en';
    const chinese = /^zh(?:-|$)/i.test(language.trim());
    const words = chinese ? {
      before: '运镜预演', after: 'AI画面',
      play: '播放对比', pause: '暂停对比', retry: '重试对比',
      loading: '正在加载两侧画面…',
      unavailable: '视频暂时无法播放，请重试加载两侧画面。',
      start: '点按播放，开始观看两侧画面。'
    } : {
      before: '3D previs', after: 'AI render',
      play: 'Play comparison', pause: 'Pause comparison', retry: 'Retry comparison',
      loading: 'Loading both views…',
      unavailable: 'Video unavailable. Retry to load both views.',
      start: 'Press Play to start both views.'
    };
    const requestedStart = stage.dataset.startTime?.trim();
    const startTime = requestedStart && Number.isFinite(Number(requestedStart)) && Number(requestedStart) >= 0
      ? Number(requestedStart) : 5.25;
    const beforeLabel = stage.dataset.beforeLabel?.trim() || words.before;
    const afterLabel = stage.dataset.afterLabel?.trim() || words.after;
    const videos = [before, after];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 600px)');
    let split = 50, pointer = null, inView = false, paused = false;
    let manualPlay = false, ready = false, loading = false, failed = false;
    let generation = 0, playPending = false, frameRequest = null, loadTimer = null;
    let upgrading = false;
    const opened = new WeakSet();
    const switching = () => upgrading || Boolean(window.ProgressiveVideo?.isSwitching(after));
    const intent = () => window.ProgressiveVideo?.getIntent(after) || { paused: after.paused };
    const setIntent = patch => window.ProgressiveVideo?.setIntent(after, patch);
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const wantsPlay = () => (!workflowPanel || workflowPanel.getAttribute('aria-hidden') !== 'true') && inView && !document.hidden && !paused && (!motion.matches || manualPlay);
    const shouldPlay = () => !switching() && wantsPlay();

    const setSplit = (value) => {
      split = clamp(value, 4, 96);
      stage.style.setProperty('--compare-split', `${split}%`);
      const rounded = Math.round(split);
      handle.setAttribute('aria-valuenow', String(rounded));
      handle.setAttribute('aria-valuetext', chinese
        ? `${rounded}% ${beforeLabel}，${100 - rounded}% ${afterLabel}`
        : `${rounded} percent ${beforeLabel}, ${100 - rounded} percent ${afterLabel}`);
    };
    const sync = (force = false) => {
      if (switching() || before.readyState < 1 || after.readyState < 1 || before.seeking || after.seeking) return;
      if (force || Math.abs(before.currentTime - after.currentTime) > .055) {
        before.currentTime = Math.min(after.currentTime, Math.max(0, before.duration - .04));
      }
    };
    const stop = () => {
      if (frameRequest !== null && after.cancelVideoFrameCallback) after.cancelVideoFrameCallback(frameRequest);
      frameRequest = null;
      videos.forEach(video => video.pause());
    };
    const track = () => {
      if (!after.requestVideoFrameCallback || frameRequest !== null) return;
      const tick = () => {
        frameRequest = null;
        if (!shouldPlay() || after.paused) return;
        sync();
        frameRequest = after.requestVideoFrameCallback(tick);
      };
      frameRequest = after.requestVideoFrameCallback(tick);
    };
    const showError = (reason = 'upgrade-failed') => {
      if (switching()) return;
      const notifyFailure = !failed && (reason === 'timeout' || reason === 'media-error');
      ++generation;
      clearTimeout(loadTimer);
      loading = false; ready = false; failed = true; playPending = false;
      stop();
      toggle.textContent = words.retry;
      status.textContent = words.unavailable;
      if (notifyFailure) stage.dispatchEvent(new CustomEvent('video-loader:preview-failed', {
        bubbles: true, detail: { videos, reason }
      }));
    };
    const play = async () => {
      if (playPending || !ready || !shouldPlay()) return;
      playPending = true;
      const run = generation;
      sync(true);
      const results = await Promise.allSettled(videos.map(video => video.play()));
      if (run !== generation) return;
      playPending = false;
      if (!shouldPlay()) { stop(); return; }
      if (results.some(result => result.status === 'rejected')) {
        paused = true;
        stop();
        toggle.textContent = words.play;
        status.textContent = words.start;
        return;
      }
      status.textContent = '';
      toggle.textContent = words.pause;
      track();
    };
    const checkReady = () => {
      if (switching() || !loading || !videos.every(video => video.readyState >= 3 && !video.seeking)) return;
      loading = false; ready = true;
      clearTimeout(loadTimer);
      status.textContent = '';
      update();
    };
    const load = () => {
      loading = true; failed = false;
      status.textContent = words.loading;
      // Each comparison owns its source pair and native decoding state.
      videos.forEach(video => {
        video.muted = true;
        video.src = mobile.matches ? video.dataset.srcMobile : video.dataset.src;
        video.load();
      });
      loadTimer = setTimeout(() => showError('timeout'), 25000);
    };
    function update() {
      if (failed) return;
      if (switching()) {
        setIntent({ paused: !wantsPlay() });
        stop();
        toggle.textContent = wantsPlay() ? words.pause : words.play;
        return;
      }
      if (!shouldPlay()) {
        stop();
        toggle.textContent = words.play;
        return;
      }
      toggle.textContent = words.pause;
      if (!ready && !loading) load();
      if (ready) play();
    }
    videos.forEach(video => {
      video.addEventListener('loadedmetadata', () => {
        if (switching() || opened.has(video)) return;
        opened.add(video);
        video.currentTime = Math.min(startTime, Math.max(0, video.duration - .08));
      });
      video.addEventListener('canplay', checkReady);
      video.addEventListener('seeked', checkReady);
      video.addEventListener('error', () => showError('media-error'));
    });
    after.addEventListener('timeupdate', () => sync());
    after.addEventListener('seeked', () => sync(true));
    stage.addEventListener('progressive-video:switch-start', event => {
      if (!event.detail?.videos?.includes(after)) return;
      upgrading = true;
      ++generation;
      playPending = false;
      clearTimeout(loadTimer);
      setIntent({ paused: !wantsPlay() });
      if (event.detail.recovery && !opened.has(after)) setIntent({ time: startTime });
      if (event.detail.recovery) videos.forEach(video => opened.add(video));
      stop();
    });
    const finishUpgrade = event => {
      if (!event.detail?.videos?.includes(after) || !upgrading) return;
      event.detail.handled = true;
      upgrading = false;
      ++generation;
      playPending = false;
      paused = intent().paused;
      if (videos.some(video => video.error)) { showError(); return; }
      // Keep the existing sources and playhead, including a successful rollback.
      loading = false; ready = true; failed = false;
      status.textContent = '';
      update();
    };
    stage.addEventListener('progressive-video:switch-end', finishUpgrade);
    stage.addEventListener('progressive-video:switch-error', finishUpgrade);
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      if (failed) { failed = false; paused = false; manualPlay = true; }
      else { paused = switching() ? !intent().paused : shouldPlay(); manualPlay = !paused; }
      update();
    });

    const pointerSplit = (event) => {
      const rect = frame.getBoundingClientRect();
      if (rect.width) setSplit((event.clientX - rect.left) / rect.width * 100);
    };
    frame.addEventListener('pointerdown', event => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
      // Touch can still scroll the page outside the handle.
      if (event.pointerType === 'touch' && !event.target.closest('.ab-compare__handle')) return;
      event.preventDefault();
      pointer = event.pointerId;
      pointerSplit(event);
      frame.setPointerCapture(pointer);
    });
    frame.addEventListener('pointermove', event => {
      if (event.pointerId !== pointer) return;
      event.preventDefault(); pointerSplit(event);
    });
    const endPointer = event => {
      if (event.pointerId !== pointer) return;
      if (frame.hasPointerCapture(pointer)) frame.releasePointerCapture(pointer);
      pointer = null;
    };
    frame.addEventListener('pointerup', endPointer);
    frame.addEventListener('pointercancel', endPointer);
    frame.addEventListener('lostpointercapture', () => { pointer = null; });
    handle.addEventListener('keydown', event => {
      const steps = { ArrowLeft: -2, ArrowDown: -2, ArrowRight: 2, ArrowUp: 2, PageDown: -10, PageUp: 10, Home: 4 - split, End: 96 - split };
      if (!(event.key in steps)) return;
      event.preventDefault(); setSplit(split + steps[event.key]);
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        const visible = entries[0].isIntersecting;
        // A pause applies to this visit only. Returning to the section starts
        // both muted views again without another click.
        if (visible && !inView) paused = false;
        inView = visible;
        update();
      }, { threshold: 0 }).observe(frame);
    } else { inView = true; }
    if (workflowPanel) new MutationObserver(update).observe(workflowPanel, { attributes: true, attributeFilter: ['aria-hidden'] });
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pagehide', () => { if (switching()) setIntent({ paused: true }); stop(); });
    window.addEventListener('pageshow', update);
    motion.addEventListener('change', () => { manualPlay = false; update(); });
    setSplit(split);
    update();
  };
  document.querySelectorAll('[data-about-comparison]').forEach(initialize);
})();
