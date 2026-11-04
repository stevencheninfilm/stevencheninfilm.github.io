// Full films load only after a deliberate play action; native controls handle seeking/fullscreen.
(() => {
  const players = [];
  document.querySelectorAll('[data-film-player]').forEach(player => {
    const video = player.querySelector('video');
    const button = player.querySelector('[data-film-play]');
    const status = player.querySelector('[data-film-status]');
    if (!video || !button || !status) return;

    let failed = false;
    let pending = false;
    let attempt = 0;
    let timer;
    let upgrading = false;
    const switching = () => upgrading || Boolean(window.ProgressiveVideo?.isSwitching(video));
    const intent = () => window.ProgressiveVideo?.getIntent(video) || { paused: video.paused };
    const setIntent = patch => window.ProgressiveVideo?.setIntent(video, patch);
    const clearWait = () => { clearTimeout(timer); timer = undefined; };
    const showPlay = (message = '', label = failed ? '重新加载' : '播放正片') => {
      clearWait();
      button.hidden = false;
      button.textContent = label;
      status.textContent = message;
    };
    const suspend = () => {
      ++attempt;
      pending = false;
      clearWait();
      if (switching()) setIntent({ paused: true });
      video.pause();
      if (video.getAttribute('src')) showPlay('', failed ? '重新加载' : '继续播放');
    };
    const useLightSource = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      return matchMedia('(max-width: 680px)').matches || connection?.saveData || /(^|-)2g$|3g/.test(connection?.effectiveType || '');
    };
    players.push({ video, suspend });
    video.controls = false;
    button.hidden = false;
    const requestPlay = () => {
      const request = ++attempt;
      clearWait();
      // Keep an existing download and playhead on a slow connection. Only a media error reloads it.
      if (!video.getAttribute('src') || failed) {
        failed = false;
        video.src = useLightSource() && video.dataset.srcMobile ? video.dataset.srcMobile : video.dataset.src;
        video.preload = 'auto';
        video.load();
      }
      pending = true;
      video.controls = true;
      button.hidden = true;
      status.textContent = '正在加载，稍候即可播放…';
      timer = setTimeout(() => {
        if (request !== attempt || !pending || document.hidden) return;
        showPlay('连接较慢，可继续等待、重试播放，或使用下方的备用链接。', '重试播放');
      }, 15000);
      const rejected = error => {
        if (request !== attempt || !pending) return;
        pending = false;
        if (error?.name === 'AbortError') { showPlay('', '继续播放'); return; }
        failed = error?.name !== 'NotAllowedError';
        showPlay(error?.name === 'NotAllowedError' ? '请点按播放。' : '暂时无法播放，请重试或使用备用链接。');
      };
      // Some older WebKit implementations return undefined from play().
      try { Promise.resolve(video.play()).catch(rejected); }
      catch (error) { rejected(error); }
    };
    button.addEventListener('click', () => {
      if (switching()) {
        setIntent({ paused: false });
        button.hidden = true;
        status.textContent = '';
        return;
      }
      requestPlay();
    });
    video.addEventListener('play', () => {
      if (switching()) { setIntent({ paused: false }); video.pause(); return; }
      for (const other of players) if (other.video !== video) other.suspend();
    });
    video.addEventListener('playing', () => {
      if (switching()) return;
      if (document.hidden) { suspend(); return; }
      if (video.paused) return;
      ++attempt;
      failed = false;
      pending = false;
      clearWait();
      button.hidden = true;
      status.textContent = '';
    });
    video.addEventListener('pause', () => {
      if (switching()) return;
      if (!pending) return;
      ++attempt;
      pending = false;
      showPlay('', '继续播放');
    });
    video.addEventListener('error', () => {
      if (switching()) return;
      ++attempt;
      failed = true;
      pending = false;
      video.pause();
      showPlay('视频加载失败，请重试或使用备用链接。');
    });
    video.addEventListener('ended', () => { if (!switching()) showPlay('', '重新播放'); });
    video.addEventListener('seeking', () => {
      if (switching() && video.readyState >= 1 && Number.isFinite(video.currentTime)) setIntent({ time: video.currentTime });
    });
    video.addEventListener('volumechange', () => {
      if (switching()) setIntent({ muted: video.muted, volume: video.volume });
    });
    video.addEventListener('ratechange', () => {
      if (switching()) setIntent({ playbackRate: video.playbackRate });
    });
    player.addEventListener('progressive-video:switch-start', event => {
      if (!event.detail?.videos?.includes(video)) return;
      upgrading = true;
      ++attempt;
      pending = false;
      clearWait();
      if (document.hidden) setIntent({ paused: true });
      video.pause();
    });
    const finishUpgrade = event => {
      if (!event.detail?.videos?.includes(video) || !upgrading) return;
      event.detail.handled = true;
      upgrading = false;
      ++attempt;
      failed = Boolean(video.error);
      if (failed) { showPlay('视频加载失败，请重试或使用备用链接。'); return; }
      if (document.hidden || intent().paused) { showPlay('', '继续播放'); return; }
      requestPlay();
    };
    player.addEventListener('progressive-video:switch-end', finishUpgrade);
    player.addEventListener('progressive-video:switch-error', finishUpgrade);
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
  });
})();
