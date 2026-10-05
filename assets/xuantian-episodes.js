(() => {
  const section = document.querySelector('#full-film');
  if (!section) return;
  const panels = [...section.querySelectorAll('[data-episode-panel]')];
  const platforms = [...section.querySelectorAll('[data-episode-platforms]')];
  const choices = [...section.querySelectorAll('[data-episode-select]')];
  const video = section.querySelector('video');
  const episodePlayers = new Map();

  const select = (key) => {
    if (!panels.some(panel => panel.dataset.episodePanel === key)) return;
    // Stop hidden playback, including a pending native play request.
    if (key !== 'trailer') video?.pause();
    episodePlayers.forEach((player, episodeKey) => {
      if (key !== episodeKey) player.stop();
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.episodePanel !== key; });
    platforms.forEach(row => { row.hidden = row.dataset.episodePlatforms !== key; });
    choices.forEach(choice => {
      if (choice.dataset.episodeSelect === key) choice.setAttribute('aria-current', 'true');
      else choice.removeAttribute('aria-current');
    });
  };

  // Each published episode uses the same player lifecycle and cinema expansion.
  // Upcoming calendar-only episodes do not acquire a player until published.
  panels.forEach(panel => {
    const key = panel.dataset.episodePanel;
    const embed = panel.querySelector('[data-episode-embed]');
    const mount = panel.querySelector('[data-episode-mount]');
    const cover = panel.querySelector('.xj-episode-cover');
    const help = panel.querySelector('[data-episode-help]');
    const status = panel.querySelector('[data-episode-status]');
    if (!embed?.dataset.embedSrc || !mount || !cover || !help || !status) return;
    const title = panel.getAttribute('aria-label') || '《玄天诀》剧集';
    let frame = null;
    let loadTimer;

    const stopEpisode = () => {
      window.clearTimeout(loadTimer);
      // Removing the cross-origin browsing context stops hidden playback.
      frame?.remove();
      frame = null;
      delete embed.dataset.embedOpen;
      mount.hidden = true;
      cover.hidden = false;
      help.hidden = true;
      // Keep the expanded size, just like the trailer on pause/retry/replay.
    };
    episodePlayers.set(key, {stop: stopEpisode});

    const playEpisode = () => {
      select(key);
      // Trigger the shared width + backdrop transition at the user's click,
      // without waiting for the third-party iframe or claiming it is playing.
      embed.dataset.screenExpanded = 'true';
      if (!frame) {
        const player = document.createElement('iframe');
        frame = player;
        player.title = `${title.replace('：', ' · ')} — 抖音官方播放器`;
        player.allow = 'autoplay; fullscreen; picture-in-picture';
        player.allowFullscreen = true;
        player.referrerPolicy = 'unsafe-url'; // Douyin's official embed specification.
        player.src = embed.dataset.embedSrc;
        player.tabIndex = 0;
        status.textContent = '正在加载本集的抖音播放器…';
        player.addEventListener('load', () => {
          if (frame !== player) return;
          window.clearTimeout(loadTimer);
          // A cross-origin load event does not prove successful video playback.
          status.textContent = '抖音视频源 · 未自动播放时，请点击画面内的播放键。';
        });
        loadTimer = window.setTimeout(() => {
          if (frame === player) status.textContent = '播放器加载较慢，可重新加载，或前往抖音观看本集。';
        }, 15000);
        mount.append(player);
        embed.dataset.embedOpen = 'true';
        cover.hidden = true;
        mount.hidden = false;
        help.hidden = false;
      }
      try { window.history.replaceState(null, '', `#${key}`); } catch { /* file: previews */ }
      panel.scrollIntoView({block: 'start', behavior: 'instant'});
      frame.focus({preventScroll: true});
    };

    const source = panel.querySelector('[data-episode-source]');
    if (source) source.textContent = '站内播放';
    cover.setAttribute('aria-label', `本站播放${title}（抖音视频源）`);
    panel.querySelectorAll('[data-episode-play]').forEach(control => {
      control.hidden = false;
      control.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        playEpisode();
      });
    });
    panel.querySelector('[data-episode-reload]')?.addEventListener('click', () => {
      stopEpisode();
      playEpisode();
    });
  });
  window.addEventListener('pagehide', () => episodePlayers.forEach(player => player.stop()));

  choices.forEach(choice => choice.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const key = choice.dataset.episodeSelect;
    select(key);
    // Keep the selection in place; do not jump the viewport on every switch.
    // Native anchors still work if JavaScript is disabled or history is blocked.
    try { window.history.replaceState(null, '', `#${key}`); } catch { /* file: previews */ }
  }));

  // Reveal a hidden episode before native anchor scrolling runs. The calendar
  // and closing CTA can be used far below the player while the trailer is selected;
  // waiting until hashchange would leave their anchor target without a layout box.
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href^="#"]');
    if (link) select(link.getAttribute('href').slice(1));
  });

  window.addEventListener('hashchange', () => select(window.location.hash.slice(1)));
  const initialKey = window.location.hash.slice(1);
  select(panels.some(panel => panel.dataset.episodePanel === initialKey) ? initialKey : 'episode-1');
})();
