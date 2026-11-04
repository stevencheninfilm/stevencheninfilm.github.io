(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 680px)');
  const time = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;

  document.querySelectorAll('[data-workflow-player]').forEach(player => {
    const video = player.querySelector('video');
    const chinese = /^zh(?:-|$)/i.test(document.documentElement?.lang || player.dataset.playerLang || 'en');
    const words = chinese
      ? { retry: '重试', play: '播放', pause: '暂停', soundOff: '静音', soundOn: '声音开启', unmute: '开启声音', mute: '关闭声音', start: '点按播放，开始观看。', unavailable: '视频暂时不可用，请点按重试。' }
      : { retry: 'Retry', play: 'Play', pause: 'Pause', soundOff: 'Sound off', soundOn: 'Sound on', unmute: 'Unmute video', mute: 'Mute video', start: 'Press Play to start the film.', unavailable: 'Video unavailable. Select Retry to load it again.' };
    video.defaultMuted = true;
    video.muted = true;
    const controls = player.querySelector('[data-player-controls]');
    const toggle = player.querySelector('[data-player-toggle]');
    const seek = player.querySelector('[data-player-seek]');
    const clock = player.querySelector('[data-player-time]');
    const sound = player.querySelector('[data-player-sound]');
    const status = player.querySelector('[data-player-status]');
    const card = player.closest('.deck-card');
    const deck = player.closest('.project-deck');
    const panel = player.closest('[data-workflow-item]');
    const controlsDelay = Math.max(0, Number(player.dataset.controlsDelay) || 0);
    let controlsTimer = 0, controlsReady = !controlsDelay;
    let visible = false, wasActive = false, loaded = false, paused = false;
    let manual = false, scrubbing = false, resume = false, failed = false;
    let upgrading = false, playGeneration = 0, knownDuration = 0;
    const switching = () => upgrading || Boolean(window.ProgressiveVideo?.isSwitching(video));
    const intent = () => window.ProgressiveVideo?.getIntent(video) || { paused: video.paused, time: video.currentTime, muted: video.muted };
    const setIntent = patch => window.ProgressiveVideo?.setIntent(video, patch);
    const active = () => visible && !document.hidden &&
      (!card || (card.classList.contains('is-active') && !deck.classList.contains('is-strip'))) &&
      (!panel || panel.getAttribute('aria-hidden') !== 'true');
    const wantsPlay = () => active() && !paused && (!scrubbing || resume) && (!motion.matches || manual);
    const canPlay = () => !switching() && !scrubbing && wantsPlay();
    const paintControls = isActive => {
      controls.setAttribute('data-visible', String(controlsReady));
      controls.inert = !isActive || !controlsReady;
    };
    const resetControls = () => {
      clearTimeout(controlsTimer);
      controlsTimer = 0;
      controlsReady = !controlsDelay;
      paintControls(false);
    };
    const draw = () => {
      const length = Number.isFinite(video.duration) ? video.duration : 0;
      if (!switching() && length) knownDuration = length;
      const duration = switching() ? knownDuration || length : length;
      const state = switching() ? intent() : { time: video.currentTime, paused: video.paused, muted: video.muted };
      const percentage = duration ? Math.min(100, state.time / duration * 100) : 0;
      if (!scrubbing) seek.value = percentage;
      seek.style.setProperty('--seek', `${scrubbing ? seek.value : percentage}%`);
      seek.disabled = !duration;
      seek.setAttribute('aria-valuetext', chinese ? `${time(state.time)}，共 ${time(duration)}` : `${time(state.time)} of ${time(duration)}`);
      clock.textContent = `${time(state.time)} / ${time(duration)}`;
      toggle.textContent = failed ? words.retry : state.paused ? words.play : words.pause;
      toggle.setAttribute('aria-label', chinese ? `${toggle.textContent}视频` : `${toggle.textContent} video`);
      sound.textContent = state.muted ? words.soundOff : words.soundOn;
      sound.setAttribute('aria-label', state.muted ? words.unmute : words.mute);
      sound.setAttribute('aria-pressed', String(!state.muted));
    };
    const play = () => {
      if (!canPlay()) return;
      const generation = ++playGeneration;
      const rejected = () => {
        if (generation === playGeneration && canPlay()) { paused = true; status.textContent = words.start; draw(); }
      };
      try {
        Promise.resolve(video.play()).then(() => {
          if (generation === playGeneration && !canPlay()) video.pause();
        }).catch(rejected);
      } catch (_) { rejected(); }
    };
    const load = () => {
      if (loaded) return;
      loaded = true;
      video.src = mobile.matches && video.dataset.srcMobile ? video.dataset.srcMobile : video.dataset.src;
      video.load();
    };
    const update = () => {
      const isActive = active();
      if (isActive && !wasActive) {
        paused = false;
        // Every new visit starts quietly; sound remains an explicit choice within it.
        video.muted = true;
        if (switching()) setIntent({ muted: true });
      }
      wasActive = isActive;
      if (!isActive) resetControls();
      else if (!controlsReady && !controlsTimer) {
        // Count uninterrupted time on this project, not time spent on other cards.
        controlsTimer = setTimeout(() => {
          controlsTimer = 0;
          if (!active()) return;
          controlsReady = true;
          paintControls(true);
        }, controlsDelay);
      }
      paintControls(isActive);
      if (switching()) setIntent({ paused: !wantsPlay() });
      if (canPlay() && !failed) { load(); play(); }
      else video.pause();
      draw();
    };
    controls.hidden = false;
    // Keep range drags and keyboard seeking inside the player, not the homepage deck.
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'keydown', 'keyup', 'wheel']) {
      controls.addEventListener(event, e => e.stopPropagation());
    }
    toggle.addEventListener('click', () => {
      if (failed) { failed = false; loaded = false; paused = false; }
      else paused = switching() ? !intent().paused : !video.paused;
      manual = true;
      status.textContent = '';
      update();
    });
    sound.addEventListener('click', () => {
      const muted = switching() ? !intent().muted : !video.muted;
      if (switching()) setIntent({ muted });
      video.muted = muted;
      draw();
    });
    const beginSeek = () => {
      if (seek.disabled || scrubbing) return;
      resume = !(switching() ? intent().paused : video.paused);
      scrubbing = true;
      video.pause();
    };
    const endSeek = () => {
      if (!scrubbing) return;
      scrubbing = false;
      if (switching()) setIntent({ paused: !resume || paused || !active() });
      if (resume && canPlay()) play();
      draw();
    };
    seek.addEventListener('pointerdown', event => {
      beginSeek();
      if (scrubbing) seek.setPointerCapture(event.pointerId);
    });
    seek.addEventListener('input', () => {
      const duration = switching() ? knownDuration : video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        const target = Math.min(duration - .04, Math.max(0, Number(seek.value) / 100 * duration));
        if (switching()) setIntent({ time: target });
        else video.currentTime = target;
      }
      draw();
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'change', 'blur']) seek.addEventListener(event, endSeek);
    for (const event of ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'volumechange']) video.addEventListener(event, draw);
    video.addEventListener('canplay', () => { if (switching()) return; status.textContent = ''; play(); });
    video.addEventListener('error', () => {
      if (switching()) return;
      failed = true; video.pause(); status.textContent = words.unavailable; draw();
    });
    player.addEventListener('progressive-video:switch-start', event => {
      if (!event.detail?.videos?.includes(video)) return;
      upgrading = true;
      ++playGeneration;
      setIntent({ paused: !wantsPlay() });
      video.pause();
      draw();
    });
    const finishUpgrade = event => {
      if (!event.detail?.videos?.includes(video) || !upgrading) return;
      event.detail.handled = true;
      upgrading = false;
      ++playGeneration;
      paused = intent().paused;
      failed = Boolean(video.error);
      status.textContent = failed ? words.unavailable : '';
      update();
    };
    player.addEventListener('progressive-video:switch-end', finishUpgrade);
    player.addEventListener('progressive-video:switch-error', finishUpgrade);
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting; update();
    }, { threshold: .1 }).observe(player);
    else visible = true;
    const observer = new MutationObserver(update);
    for (const element of [card, deck, panel].filter(Boolean)) observer.observe(element, { attributes: true, attributeFilter: ['class', 'aria-hidden'] });
    document.addEventListener('visibilitychange', update);
    window.addEventListener('pagehide', () => {
      ++playGeneration;
      if (switching()) setIntent({ paused: true });
      wasActive = false; resetControls(); video.pause();
    });
    window.addEventListener('pageshow', update);
    motion.addEventListener('change', () => { manual = false; update(); });
    update();
  });
})();
