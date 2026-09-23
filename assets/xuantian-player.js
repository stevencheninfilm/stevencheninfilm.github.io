(() => {
  // Native URL playback preserves range requests and iOS user activation.
  // Do not fetch the whole movie into a Blob or gate taps on canplay.
  const shell = document.querySelector('[data-xj-player]');
  if (!shell) return;
  const video = shell.querySelector('video');
  const playButton = shell.querySelector('.xj-video-play');
  const status = shell.querySelector('.xj-player-status');
  const help = shell.querySelector('.xj-player-help');
  const message = shell.querySelector('.xj-player-message');
  const retry = shell.querySelector('.xj-player-retry');
  if (!video || !playButton || !status || !help || !message || !retry) return;

  let state = 'idle';
  let timer = 0;
  let attempt = 0;
  const clearTimer = () => { window.clearTimeout(timer); timer = 0; };
  const render = (next, copy = '') => {
    state = next;
    shell.dataset.playerState = next;
    playButton.hidden = next !== 'idle';
    status.hidden = next !== 'loading';
    status.textContent = next === 'loading' ? '正在准备播放…' : '';
    help.hidden = next !== 'error' && next !== 'slow';
    message.textContent = copy;
  };
  const showHelp = (copy) => {
    clearTimer();
    render('error', copy);
  };
  const startWaiting = () => {
    clearTimer();
    render('loading');
    timer = window.setTimeout(() => {
      if (state !== 'loading') return;
      render('slow', '加载时间较长。可以重试播放，或前往新片场观看。');
      // Keep the pending native play alive: late playback can still recover.
    }, 15000);
  };
  const failureMessage = () => {
    if (navigator.onLine === false) return '网络已断开，请联网后重试。';
    if (video.error?.code === 3 || video.error?.code === 4) {
      return '当前浏览器未能播放此视频。请在系统浏览器中打开，或前往新片场观看。';
    }
    return '视频暂时无法加载。请重试，或选择其他观看入口。';
  };

  const requestPlay = (reload = false) => {
    if (reload || video.error) video.load();
    const currentAttempt = ++attempt;
    video.muted = false;
    video.controls = true;
    startWaiting();
    try {
      // Must execute synchronously inside the click, before any await/fetch.
      const playback = video.play();
      if (playback && typeof playback.catch === 'function') {
        playback.catch((error) => {
          if (currentAttempt !== attempt) return;
          if (error?.name === 'AbortError' && video.paused) {
            clearTimer();
            render('idle');
            return;
          }
          showHelp(error?.name === 'NotAllowedError'
            ? '请点击视频原生播放按钮，或在系统浏览器中打开此页面。'
            : failureMessage());
        });
      }
    } catch {
      if (currentAttempt === attempt) showHelp(failureMessage());
    }
  };

  playButton.addEventListener('click', () => requestPlay());
  retry.addEventListener('click', () => requestPlay(true));
  video.addEventListener('play', startWaiting);
  video.addEventListener('waiting', () => { if (!video.paused) startWaiting(); });
  video.addEventListener('playing', () => { clearTimer(); render('playing'); });
  video.addEventListener('pause', () => {
    ++attempt;
    clearTimer();
    if (!video.error) render('idle');
  });
  video.addEventListener('ended', () => { ++attempt; clearTimer(); render('idle'); });
  video.addEventListener('error', () => { ++attempt; showHelp(failureMessage()); });
  window.addEventListener('pagehide', () => { ++attempt; clearTimer(); });
  window.addEventListener('pageshow', () => {
    clearTimer();
    if (video.error) showHelp(failureMessage());
    else if (video.paused || video.ended) render('idle');
    else if (video.readyState >= 3) render('playing');
    else startWaiting();
  });

  if (video.error) showHelp(failureMessage());
  else render('idle');
})();
