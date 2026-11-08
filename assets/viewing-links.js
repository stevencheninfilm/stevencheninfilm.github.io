(() => {
  const selector = 'a[data-viewing-link]';
  const prepared = new WeakSet();
  const originalTargets = new WeakMap();
  const openedKey = 'steven-viewing-links-opened';
  let opened = new Set();
  try {
    const saved = JSON.parse(sessionStorage.getItem(openedKey) || '[]');
    if (Array.isArray(saved)) opened = new Set(saved.filter(url => typeof url === 'string'));
  } catch { /* Copy tools still work when browser storage is unavailable. */ }
  const coarsePointer = window.matchMedia?.('(pointer: coarse)');
  const inApp = /MicroMessenger|Weibo|AlipayClient|XiaoHongShu|XHSWebView|XHS\/|aweme|BytedanceWebview/i.test(navigator.userAgent || '');

  const updateTarget = link => {
    if (coarsePointer?.matches || inApp) {
      // Let the browser follow the real HTTPS link without opening a new window.
      link.setAttribute('target', '_self');
    } else {
      const original = originalTargets.get(link);
      if (original == null) link.removeAttribute('target');
      else link.setAttribute('target', original);
    }
  };

  const prepare = link => {
    if (prepared.has(link)) return;
    let destination;
    try { destination = new URL(link.href, location.href); } catch { return; }
    if (destination.protocol !== 'https:' || destination.origin === location.origin) return;
    prepared.add(link);
    originalTargets.set(link, link.getAttribute('target'));
    updateTarget(link);
    const language = link.closest?.('[lang]')?.getAttribute('lang') || document.documentElement?.lang || 'zh-Hans';
    const chinese = /^zh(?:-|$)/i.test(language);
    const words = chinese ? {
      copy: '复制链接', manual: '可手动复制的视频链接',
      copied: '链接已复制，可粘贴到浏览器打开。', fallback: '请长按或选中下方链接复制。'
    } : {
      copy: 'Copy link', manual: 'Video link for manual copying',
      copied: 'Link copied. Paste it into your browser to open.', fallback: 'Select and copy the link below.'
    };

    const group = document.createElement('span');
    group.className = 'viewing-link-group';
    const tools = document.createElement('span');
    tools.className = 'viewing-link-tools';
    tools.lang = chinese ? 'zh-Hans' : 'en';
    tools.hidden = !opened.has(destination.href);
    const copy = document.createElement('button');
    copy.className = 'viewing-link-copy';
    copy.type = 'button';
    copy.textContent = words.copy;
    const name = link.dataset.viewingLabel || link.textContent.replace(/\s*↗\s*$/, '').trim();
    copy.setAttribute('aria-label', `${name}${chinese ? '：' : ': '}${words.copy}`);
    const status = document.createElement('span');
    status.className = 'viewing-link-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    status.hidden = true;
    const manual = document.createElement('input');
    manual.className = 'viewing-link-url';
    manual.type = 'url';
    manual.readOnly = true;
    manual.hidden = true;
    manual.setAttribute('aria-label', words.manual);
    manual.addEventListener('focus', () => manual.select());
    tools.append(copy, status, manual);
    // Keep a platform link and its copy action together as one grid/flex item.
    link.insertAdjacentElement('beforebegin', group);
    group.append(link, tools);

    const reveal = () => {
      tools.hidden = false;
      opened.add(destination.href);
      // A touch-screen link leaves this page; keep its tools available on return.
      try { sessionStorage.setItem(openedKey, JSON.stringify([...opened])); } catch {}
    };
    // Observe activation without preventing or replacing native navigation.
    link.addEventListener('click', reveal);
    link.addEventListener('auxclick', event => {
      if (event.button === 1) reveal();
    });

    copy.addEventListener('click', async () => {
      const url = link.href;
      copy.disabled = true;
      manual.hidden = true;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url);
        status.textContent = words.copied;
      } catch {
        status.textContent = words.fallback;
        manual.value = url;
        manual.hidden = false;
        manual.focus();
        manual.select();
      } finally {
        status.hidden = false;
        copy.disabled = false;
      }
    });
  };

  const scan = root => {
    if (root.matches?.(selector)) prepare(root);
    root.querySelectorAll?.(selector).forEach(prepare);
  };
  scan(document);
  coarsePointer?.addEventListener?.('change', () => {
    document.querySelectorAll(selector).forEach(link => {
      if (prepared.has(link)) updateTarget(link);
    });
  });
  // Film viewing links are created when a project dialog opens.
  if (document.body && typeof MutationObserver !== 'undefined') {
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === 1) scan(node);
      }));
    }).observe(document.body, { childList: true, subtree: true });
  }
})();
