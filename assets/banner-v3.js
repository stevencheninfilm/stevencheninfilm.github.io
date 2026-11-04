document.querySelectorAll('[data-comparison]').forEach((stage) => {

  const card = stage.closest('.deck-card');
  const deck = stage.closest('.project-deck');
  const frame = stage.querySelector('.comparison-frame');
  const visual = stage.querySelector('.comparison-visual') || frame;
  const handle = stage.querySelector('.comparison-handle');
  const before = stage.querySelector('.comparison-video--before');
  const after = stage.querySelector('.comparison-video--after');
  if (!card || !deck || !frame || !handle || !before || !after) return;

  const videos = [before, after];
  const mediaReady = () => videos.every(video => video.dataset.videoLoaderManaged !== 'true' || video.dataset.videoLoaderReady === 'true');
  const master = after;
  const child = before;
  const controls = stage.querySelector('[data-comparison-controls]');
  const toggle = stage.querySelector('[data-comparison-play]');
  const seek = stage.querySelector('[data-comparison-seek]');
  const clock = stage.querySelector('[data-comparison-time]');
  const sound = stage.querySelector('[data-comparison-sound]');
  const controlsDelay = Math.max(0, Number(stage.dataset.controlsDelay) || 0);
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMedia = window.matchMedia('(max-width: 600px)');
  const initialTime = Number(stage.dataset.startTime ?? 5.25);
  const chinese = /^zh(?:-|$)/i.test(document.documentElement?.lang || 'en');
  const beforeLabel = stage.dataset.beforeLabel || (chinese ? '3D 运镜预演' : '3D previs');
  const afterLabel = stage.dataset.afterLabel || (chinese ? 'AI 生成画面' : 'AI render');
  const words = chinese
    ? { play: '播放', pause: '暂停', playLabel: '播放对比视频', pauseLabel: '暂停对比视频', soundOff: '声音关闭', soundOn: '声音开启', unmute: '开启视频声音', mute: '关闭视频声音' }
    : { play: 'Play', pause: 'Pause', playLabel: 'Play comparison video', pauseLabel: 'Pause comparison video', soundOff: 'Sound off', soundOn: 'Sound on', unmute: 'Unmute video', mute: 'Mute video' };
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

  let split = 50;
  let loaded = false;
  let initialSeeked = false;
  let pairReady = null;
  let videoFrame = null;
  let activePointer = null;
  let copyTimer = null;
  let buffering = false;
  let autoplayBlocked = false;
  let userPaused = false;
  let scrubbing = false;
  let resumeAfterSeek = false;
  let wasActive = false;
  let controlsTimer = null;
  let controlsReady = !controlsDelay;
  let upgrading = false, playGeneration = 0, knownDuration = 0;
  const switching = () => upgrading || Boolean(window.ProgressiveVideo?.isSwitching(master));
  const intent = video => window.ProgressiveVideo?.getIntent(video) || { paused: video.paused, time: video.currentTime, muted: video.muted };
  const setIntent = (video, patch) => window.ProgressiveVideo?.setIntent(video, patch);
  const canContinue = () => videos.every(video => video.readyState >= 3 && !video.seeking);
  const timeLabel = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;
  const duration = () => {
    const lengths = videos.map(video => video.duration).filter(value => Number.isFinite(value) && value > 0);
    const length = lengths.length === videos.length ? Math.min(...lengths) : 0;
    if (!switching() && length) knownDuration = length;
    return switching() ? knownDuration || length : length;
  };
  const drawControls = () => {
    if (!controls) return;
    const length = duration();
    const state = switching() ? intent(master) : { time: master.currentTime, paused: master.paused, muted: master.muted };
    const percentage = length ? Math.min(100, state.time / length * 100) : 0;
    if (!scrubbing) seek.value = percentage;
    seek.style.setProperty('--seek', `${scrubbing ? seek.value : percentage}%`);
    seek.disabled = !length;
    seek.setAttribute('aria-valuetext', chinese ? `${timeLabel(state.time)}，共 ${timeLabel(length)}` : `${timeLabel(state.time)} of ${timeLabel(length)}`);
    clock.textContent = `${timeLabel(state.time)} / ${timeLabel(length)}`;
    toggle.textContent = state.paused ? words.play : words.pause;
    toggle.setAttribute('aria-label', state.paused ? words.playLabel : words.pauseLabel);
    sound.textContent = state.muted ? words.soundOff : words.soundOn;
    sound.setAttribute('aria-label', state.muted ? words.unmute : words.mute);
    sound.setAttribute('aria-pressed', String(!state.muted));
  };

  const setSplit = (value) => {
    split = clamp(value, 4, 96);
    const rounded = Math.round(split);
    stage.style.setProperty('--compare-split', `${split}%`);
    handle.setAttribute('aria-valuenow', String(rounded));
    handle.setAttribute('aria-valuetext', `${rounded}% ${beforeLabel}${chinese ? '，' : ', '}${100 - rounded}% ${afterLabel}`);
  };

  const loadVideos = () => {
    if (loaded || motionPreference.matches) return;
    loaded = true;
    videos.forEach((video) => {
      video.defaultMuted = true;
      video.muted = true;
      if (video.dataset.videoLoaderManaged === 'true') return;
      const source = mobileMedia.matches && video.dataset.srcMobile ? video.dataset.srcMobile : video.dataset.src;
      if (!source) return;
      video.src = source;
      video.removeAttribute('data-src');
      video.removeAttribute('data-src-mobile');
      video.load();
    });
  };

  const waitForMetadata = (video) => {
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        video.removeEventListener('loadedmetadata', finish);
        video.removeEventListener('error', finish);
        resolve();
      };
      video.addEventListener('loadedmetadata', finish, { once: true });
      video.addEventListener('error', finish, { once: true });
    });
  };

  const isActive = () => {
    const visibleCard = card.classList.contains('is-active') || card.classList.contains('is-slide-layer');
    return visibleCard
      && !deck.classList.contains('is-strip')
      && !document.body.classList.contains('is-v3-loading')
      && !document.hidden
      && !motionPreference.matches;
  };
  const shouldPlay = () => !switching() && isActive() && !userPaused && !scrubbing;
  const switchPaused = () => !isActive() || userPaused || autoplayBlocked || (scrubbing && !resumeAfterSeek);

  const seekToOpeningFrame = () => {
    if (initialSeeked || switching()) return;
    initialSeeked = true;
    videos.forEach((video) => {
      const seek = () => {
        const latestSafeTime = Number.isFinite(video.duration) ? Math.max(0, video.duration - .08) : initialTime;
        video.currentTime = Math.min(initialTime, latestSafeTime);
      };
      if (video.readyState >= 1) seek();
      else video.addEventListener('loadedmetadata', seek, { once: true });
    });
  };

  const syncChild = (force = false) => {
    if (switching() || master.readyState < 1 || child.readyState < 1 || master.seeking || child.seeking) return;
    if (buffering && !force) return;
    child.playbackRate = master.playbackRate;
    const childLimit = Number.isFinite(child.duration) ? Math.max(0, child.duration - .04) : master.currentTime;
    const targetTime = Math.min(master.currentTime, childLimit);
    // Even a forced sync must tolerate one frame of drift. Seeking to an
    // unchanged time on every play/canplay can continually starve native streams.
    if (Math.abs(child.currentTime - targetTime) > (force ? .055 : .08)) child.currentTime = targetTime;
  };

  const stopFrameSync = () => {
    if (videoFrame === null || !master.cancelVideoFrameCallback) return;
    master.cancelVideoFrameCallback(videoFrame);
    videoFrame = null;
  };

  const startFrameSync = () => {
    if (!master.requestVideoFrameCallback || videoFrame !== null) return;
    const check = () => {
      videoFrame = null;
      if (!shouldPlay() || master.paused || buffering) return;
      syncChild(false);
      if (!master.paused && !buffering) videoFrame = master.requestVideoFrameCallback(check);
    };
    videoFrame = master.requestVideoFrameCallback(check);
  };

  const startPair = () => {
    if (!shouldPlay() || !mediaReady() || autoplayBlocked) return;
    if (buffering && !canContinue()) return;
    seekToOpeningFrame();
    syncChild(true);
    // Aligning a previously stalled pair may itself need one seek/decode. Wait
    // for that seek once, rather than playing one side while the other catches up.
    if (buffering && !canContinue()) return;
    buffering = false;
    const generation = playGeneration;
    videos.forEach((video) => {
      if (!video.paused) return;
      video.play().catch(error => {
        if (generation === playGeneration && error.name === 'NotAllowedError' && shouldPlay() && !autoplayBlocked) {
          autoplayBlocked = true;
          pausePair();
          frame.dispatchEvent(new CustomEvent('video-loader:play-blocked'));
        }
      });
    });
    startFrameSync();
  };

  const playPair = () => {
    if (!shouldPlay()) return;
    loadVideos();
    if (!pairReady) {
      pairReady = Promise.all(videos.map(waitForMetadata)).then(() => {
        seekToOpeningFrame();
        syncChild(true);
      });
    }
    pairReady.then(() => {
      if (!shouldPlay()) return;
      startPair();
    });
  };

  const pausePair = () => {
    stopFrameSync();
    videos.forEach((video) => video.pause());
    drawControls();
  };

  const holdForBuffer = (video, stalled = false) => {
    if (!shouldPlay() || !mediaReady()) return;
    // A stalled network request is harmless while playback still has future data.
    if (stalled && video.readyState >= 3) return;
    buffering = true;
    pausePair();
  };

  const resumeBufferedPair = () => {
    if (buffering && canContinue()) startPair();
  };

  const updatePlayback = () => {
    handle.tabIndex = card.classList.contains('is-active') && !deck.classList.contains('is-strip') ? 0 : -1;
    const active = isActive();
    if (active && !wasActive) {
      userPaused = false;
      videos.forEach(video => { video.defaultMuted = true; video.muted = true; });
      if (switching()) videos.forEach(video => setIntent(video, { muted: true }));
    }
    wasActive = active;
    if (controls) {
      if (!active) {
        window.clearTimeout(controlsTimer);
        controlsTimer = null;
        controlsReady = !controlsDelay;
      } else if (!controlsReady && controlsTimer === null) {
        controlsTimer = window.setTimeout(() => {
          controlsTimer = null;
          if (!isActive()) return;
          controlsReady = true;
          controls.setAttribute('data-visible', 'true');
          controls.inert = false;
        }, controlsDelay);
      }
      controls.setAttribute('data-visible', String(active && controlsReady));
      controls.inert = !active || !controlsReady;
    }
    if (switching()) setIntent(master, { paused: switchPaused() });
    if (shouldPlay()) {
      playPair();
    } else {
      pausePair();
    }
    drawControls();
  };

  master.addEventListener('play', () => {
    if (!shouldPlay() || !mediaReady() || buffering || autoplayBlocked) {
      master.pause();
      return;
    }
    syncChild(true);
    startFrameSync();
  });
  master.addEventListener('pause', () => {
    stopFrameSync();
    child.pause();
  });
  master.addEventListener('seeking', () => holdForBuffer(master));
  master.addEventListener('seeked', () => { syncChild(true); resumeBufferedPair(); });
  master.addEventListener('ratechange', () => syncChild(true));
  master.addEventListener('timeupdate', () => { syncChild(false); drawControls(); });
  child.addEventListener('play', () => {
    if (!shouldPlay() || !mediaReady() || buffering || autoplayBlocked) {
      child.pause();
      return;
    }
  });
  child.addEventListener('seeking', () => holdForBuffer(child));
  child.addEventListener('seeked', resumeBufferedPair);
  videos.forEach(video => {
    video.addEventListener('waiting', () => holdForBuffer(video));
    video.addEventListener('stalled', () => holdForBuffer(video, true));
    video.addEventListener('canplay', resumeBufferedPair);
    video.addEventListener('video-loader:ready', updatePlayback);
    video.addEventListener('video-loader:play', () => { autoplayBlocked = false; startPair(); });
    for (const event of ['loadedmetadata', 'durationchange', 'play', 'pause', 'volumechange']) video.addEventListener(event, drawControls);
  });

  stage.addEventListener('progressive-video:switch-start', event => {
    if (!event.detail?.videos?.includes(master)) return;
    upgrading = true;
    ++playGeneration;
    // The engine owns the temporary pause; preserve the user's transport intent.
    setIntent(master, { paused: switchPaused() });
    buffering = false;
    pausePair();
  });
  const finishUpgrade = event => {
    if (!event.detail?.videos?.includes(master) || !upgrading) return;
    event.detail.handled = true;
    upgrading = false;
    ++playGeneration;
    userPaused = intent(master).paused;
    buffering = false;
    updatePlayback();
  };
  stage.addEventListener('progressive-video:switch-end', finishUpgrade);
  stage.addEventListener('progressive-video:switch-error', finishUpgrade);

  if (controls) {
    controls.hidden = false;
    // Seeking, toggling sound, and slider keys belong to this player rather than
    // the project deck or the comparison divider.
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'keydown', 'keyup', 'wheel']) {
      controls.addEventListener(event, e => e.stopPropagation());
    }
    toggle.addEventListener('click', () => {
      userPaused = switching() ? !intent(master).paused : !master.paused;
      if (switching()) setIntent(master, { paused: userPaused });
      if (userPaused) pausePair();
      else { autoplayBlocked = false; playPair(); }
      drawControls();
    });
    sound.addEventListener('click', () => {
      // The enhanced side supplies the one audio track. Playing two tracks would
      // create an echo even when both pictures are synchronized.
      child.muted = true;
      const muted = switching() ? !intent(master).muted : !master.muted;
      if (switching()) { setIntent(child, { muted: true }); setIntent(master, { muted }); }
      master.muted = muted;
      drawControls();
    });
    const beginSeek = () => {
      if (seek.disabled || scrubbing || !isActive()) return;
      resumeAfterSeek = !(switching() ? intent(master).paused : master.paused) && !userPaused;
      scrubbing = true;
      pausePair();
    };
    const endSeek = () => {
      if (!scrubbing) return;
      scrubbing = false;
      if (switching()) setIntent(master, { paused: !resumeAfterSeek || userPaused });
      if (resumeAfterSeek && !userPaused) startPair();
      drawControls();
    };
    seek.addEventListener('pointerdown', event => {
      beginSeek();
      if (scrubbing) seek.setPointerCapture?.(event.pointerId);
    });
    seek.addEventListener('input', () => {
      const length = duration();
      if (!length || !isActive()) return;
      const target = clamp(Number(seek.value) / 100 * length, 0, Math.max(0, length - .08));
      // Mark both sides as buffering before assigning either time; synchronous
      // seeking events must not let one picture continue on the old frame.
      buffering = true;
      pausePair();
      initialSeeked = true;
      if (switching()) setIntent(master, { time: target });
      else videos.forEach(video => { video.currentTime = target; });
      if (!scrubbing && !userPaused) resumeBufferedPair();
      drawControls();
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'change', 'blur']) seek.addEventListener(event, endSeek);
  }

  const splitFromPointer = (clientX) => {
    // The visual wrapper is display: contents on desktop and has no own box.
    // Mobile gives it the 16:9 picture box; otherwise use the full-width frame.
    const visualRect = visual.getBoundingClientRect();
    const rect = visualRect.width ? visualRect : frame.getBoundingClientRect();
    if (!rect.width) return split;
    return ((clientX - rect.left) / rect.width) * 100;
  };

  const beginInteraction = () => {
    window.clearTimeout(copyTimer);
    stage.classList.add('is-interacting', 'is-dragging');
  };

  const endInteraction = () => {
    stage.classList.remove('is-dragging');
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => stage.classList.remove('is-interacting'), 560);
  };

  frame.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target.closest('a, .video-loading-retry, [data-comparison-controls]')) return;
    const startedOnHandle = Boolean(event.target.closest('.comparison-handle'));
    if (event.pointerType === 'touch' && !startedOnHandle) return;
    event.preventDefault();
    event.stopPropagation();
    activePointer = event.pointerId;
    beginInteraction();
    setSplit(splitFromPointer(event.clientX));
    frame.setPointerCapture?.(event.pointerId);
  });

  frame.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    event.stopPropagation();
    setSplit(splitFromPointer(event.clientX));
  });

  const finishPointer = (event) => {
    if (event.pointerId !== activePointer) return;
    event.preventDefault();
    event.stopPropagation();
    if (frame.hasPointerCapture?.(event.pointerId)) frame.releasePointerCapture(event.pointerId);
    activePointer = null;
    endInteraction();
  };

  frame.addEventListener('pointerup', finishPointer);
  frame.addEventListener('pointercancel', finishPointer);

  handle.addEventListener('keydown', (event) => {
    const changes = {
      ArrowLeft: -2,
      ArrowDown: -2,
      ArrowRight: 2,
      ArrowUp: 2,
      PageDown: -10,
      PageUp: 10,
      Home: 4 - split,
      End: 96 - split
    };
    if (!(event.key in changes)) return;
    event.preventDefault();
    event.stopPropagation();
    beginInteraction();
    setSplit(split + changes[event.key]);
    endInteraction();
  });

  handle.addEventListener('click', (event) => event.stopPropagation());

  const stateObserver = new MutationObserver(updatePlayback);
  stateObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  stateObserver.observe(card, { attributes: true, attributeFilter: ['class'] });
  stateObserver.observe(deck, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('visibilitychange', updatePlayback);
  motionPreference.addEventListener('change', (event) => {
    if (event.matches) {
      pausePair();
      setSplit(50);
    } else {
      setSplit(50);
      updatePlayback();
    }
  });

  setSplit(split);
  updatePlayback();
});
