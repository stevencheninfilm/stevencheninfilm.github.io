document.querySelectorAll('[data-comparison]').forEach((stage) => {

  const card = stage.closest('.deck-card');
  const deck = stage.closest('.project-deck');
  const frame = stage.querySelector('.comparison-frame');
  const handle = stage.querySelector('.comparison-handle');
  const before = stage.querySelector('.comparison-video--before');
  const after = stage.querySelector('.comparison-video--after');
  if (!card || !deck || !frame || !handle || !before || !after) return;

  const videos = [before, after];
  const mediaReady = () => videos.every(video => video.dataset.videoLoaderManaged !== 'true' || video.dataset.videoLoaderReady === 'true');
  const master = after;
  const child = before;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMedia = window.matchMedia('(max-width: 600px)');
  const initialTime = Number(stage.dataset.startTime ?? 5.25);
  const beforeLabel = stage.dataset.beforeLabel || '3D previs';
  const afterLabel = stage.dataset.afterLabel || 'AI render';
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
  const canContinue = () => videos.every(video => video.readyState >= 3 && !video.seeking);

  const setSplit = (value) => {
    split = clamp(value, 4, 96);
    const rounded = Math.round(split);
    stage.style.setProperty('--compare-split', `${split}%`);
    handle.setAttribute('aria-valuenow', String(rounded));
    handle.setAttribute('aria-valuetext', `${rounded}% ${beforeLabel}, ${100 - rounded}% ${afterLabel}`);
  };

  const loadVideos = () => {
    if (loaded || motionPreference.matches) return;
    loaded = true;
    videos.forEach((video) => {
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

  const shouldPlay = () => {
    const visibleCard = card.classList.contains('is-active') || card.classList.contains('is-slide-layer');
    return visibleCard
      && !deck.classList.contains('is-strip')
      && !document.body.classList.contains('is-v3-loading')
      && !document.hidden
      && !motionPreference.matches;
  };

  const seekToOpeningFrame = () => {
    if (initialSeeked) return;
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
    if (master.readyState < 1 || child.readyState < 1 || master.seeking || child.seeking) return;
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
    videos.forEach((video) => {
      if (!video.paused) return;
      video.play().catch(error => {
        if (error.name === 'NotAllowedError' && shouldPlay() && !autoplayBlocked) {
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
    if (shouldPlay()) {
      playPair();
    } else {
      pausePair();
    }
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
  master.addEventListener('timeupdate', () => syncChild(false));
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
  });

  const splitFromPointer = (clientX) => {
    const rect = frame.getBoundingClientRect();
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
    if (event.target.closest('a, .video-loading-retry')) return;
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
