(() => {
  const stage = document.querySelector('[data-comparison]');
  if (!stage) return;

  const card = stage.closest('.deck-card');
  const deck = stage.closest('.project-deck');
  const frame = stage.querySelector('.comparison-frame');
  const handle = stage.querySelector('.comparison-handle');
  const before = stage.querySelector('.comparison-video--before');
  const after = stage.querySelector('.comparison-video--after');
  if (!card || !deck || !frame || !handle || !before || !after) return;

  const videos = [before, after];
  const master = after;
  const child = before;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobileMedia = window.matchMedia('(max-width: 600px)');
  const initialTime = 5.25;
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

  let split = 50;
  let loaded = false;
  let initialSeeked = false;
  let pairReady = null;
  let videoFrame = null;
  let activePointer = null;
  let copyTimer = null;

  const setSplit = (value) => {
    split = clamp(value, 4, 96);
    const rounded = Math.round(split);
    stage.style.setProperty('--compare-split', `${split}%`);
    handle.setAttribute('aria-valuenow', String(rounded));
    handle.setAttribute('aria-valuetext', `${rounded} percent 3D previs, ${100 - rounded} percent AI render`);
  };

  const loadVideos = () => {
    if (loaded || motionPreference.matches) return;
    loaded = true;
    videos.forEach((video) => {
      video.muted = true;
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
    if (master.readyState < 1 || child.readyState < 1) return;
    child.playbackRate = master.playbackRate;
    const childLimit = Number.isFinite(child.duration) ? Math.max(0, child.duration - .04) : master.currentTime;
    const targetTime = Math.min(master.currentTime, childLimit);
    if (force || Math.abs(child.currentTime - targetTime) > .055) child.currentTime = targetTime;
  };

  const stopFrameSync = () => {
    if (videoFrame === null || !master.cancelVideoFrameCallback) return;
    master.cancelVideoFrameCallback(videoFrame);
    videoFrame = null;
  };

  const startFrameSync = () => {
    if (!master.requestVideoFrameCallback || videoFrame !== null) return;
    const check = () => {
      if (!shouldPlay() || master.paused) {
        videoFrame = null;
        return;
      }
      syncChild(false);
      videoFrame = master.requestVideoFrameCallback(check);
    };
    videoFrame = master.requestVideoFrameCallback(check);
  };

  const startPair = () => {
    if (!shouldPlay()) return;
    seekToOpeningFrame();
    syncChild(true);
    videos.forEach((video) => {
      if (!video.paused) return;
      video.play().catch(() => {});
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

  const updatePlayback = () => {
    if (shouldPlay()) {
      playPair();
    } else {
      pausePair();
    }
  };

  master.addEventListener('play', () => {
    if (!shouldPlay()) {
      master.pause();
      return;
    }
    syncChild(true);
    if (child.paused) child.play().catch(() => {});
    startFrameSync();
  });
  master.addEventListener('pause', () => {
    stopFrameSync();
    child.pause();
  });
  master.addEventListener('seeking', () => syncChild(true));
  master.addEventListener('seeked', () => syncChild(true));
  master.addEventListener('ratechange', () => syncChild(true));
  master.addEventListener('timeupdate', () => syncChild(false));
  child.addEventListener('play', () => {
    if (!shouldPlay()) {
      child.pause();
      return;
    }
    if (master.paused) master.play().catch(() => {});
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
})();
