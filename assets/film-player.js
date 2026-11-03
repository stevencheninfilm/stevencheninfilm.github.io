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
    button.addEventListener('click', () => {
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
    });
    video.addEventListener('play', () => {
      for (const other of players) if (other.video !== video) other.suspend();
    });
    video.addEventListener('playing', () => {
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
      if (!pending) return;
      ++attempt;
      pending = false;
      showPlay('', '继续播放');
    });
    video.addEventListener('error', () => {
      ++attempt;
      failed = true;
      pending = false;
      video.pause();
      showPlay('视频加载失败，请重试或使用备用链接。');
    });
    video.addEventListener('ended', () => showPlay('', '重新播放'));
    window.addEventListener('pagehide', suspend);
    document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
  });
})();
