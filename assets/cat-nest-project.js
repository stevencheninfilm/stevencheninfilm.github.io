(() => {
  const tabs = [...document.querySelectorAll('[data-gallery-tab]')];
  const activate = (tab, focus = false) => {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      activate(tabs[next], true);
    });
  });
  const sceneImage = document.querySelector('[data-scene-image]');
  const sceneCaption = document.querySelector('[data-scene-caption]');
  const sceneButtons = [...document.querySelectorAll('[data-scene-src]')];
  sceneButtons.forEach(button => {
    button.addEventListener('click', () => {
      sceneImage.src = button.dataset.sceneSrc;
      sceneImage.alt = `${button.dataset.sceneName}，六张餐桌与完整厨房的游戏场景`;
      sceneCaption.textContent = button.dataset.sceneName;
      sceneButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    });
  });
  const copy = document.querySelector('[data-copy-wechat]');
  copy?.addEventListener('click', async () => {
    const number = document.getElementById('cn-wechat-number').textContent.trim();
    const status = document.getElementById('cn-copy-status');
    try {
      await navigator.clipboard.writeText(number);
      status.textContent = '微信号已复制，期待和你交流。';
      copy.textContent = '已复制 ✓';
    } catch {
      status.textContent = `请长按或选中上方微信号复制：${number}`;
    }
  });
})();
