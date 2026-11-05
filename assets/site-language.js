/* Separate language pages: explicit links and manual preference precede region defaults. */
(() => {
  'use strict';
  const preferenceKey = 'steven-site-language';
  const aiPage = /^\/(?:(?:en|zh)\/)?ai(?:\/|$)/.test(location.pathname);
  const routes = aiPage
    ? { en: '/en/ai/index.html', zh: '/zh/ai/index.html' }
    : { en: '/en/index.html', zh: '/zh/index.html' };
  const supportedLanguage = value => value === 'en' || value === 'zh';
  const rootHome = /^\/(?:index(?:-v3)?\.html)?$/.test(location.pathname);
  const rootAI = /^\/ai\/(?:index\.html)?$/.test(location.pathname);
  const currentLanguage = /^\/zh(?:\/|$)/.test(location.pathname) ||
    /^zh(?:-|$)/i.test(document.documentElement.lang) ? 'zh' : 'en';
  const links = [...document.querySelectorAll('a[data-site-language]')];
  let automaticCancelled = false;
  let controller;
  let deadline;

  const storedPreference = () => {
    try {
      const saved = localStorage.getItem(preferenceKey);
      return supportedLanguage(saved) ? saved : null;
    } catch { return null; }
  };
  const stopAutomatic = () => {
    automaticCancelled = true;
    clearTimeout(deadline);
    controller?.abort();
  };
  const destination = (language, preserveActiveProject = false) => {
    const url = new URL(routes[language], location.origin);
    url.search = location.search;
    url.hash = location.hash;
    if (preserveActiveProject) {
      if (aiPage) {
        const story = document.querySelector('[data-workflow-item][aria-hidden="false"]');
        const rect = story?.getBoundingClientRect?.();
        if (story?.id && rect && rect.bottom > 0 && rect.top < (document.documentElement.clientHeight || Infinity)) {
          url.hash = `#${story.id}`;
        }
      } else {
        const page = document.querySelector('.project-deck .deck-card.is-active')?.dataset.page;
        // The active card owns its ID; new projects must not need a routing edit.
        if (/^(?:-1|0|[1-9]\d*)$/.test(page ?? '')) url.searchParams.set('project', page);
      }
    }
    return url;
  };
  const updateLink = (link) => {
    const language = link?.dataset.siteLanguage;
    if (!supportedLanguage(language)) return false;
    link.href = destination(language, true).href;
    link.setAttribute('hreflang', language === 'zh' ? 'zh-Hans' : 'en');
    if (language === currentLanguage) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    return true;
  };
  links.forEach(updateLink);
  // Refresh before the browser opens a normal, modified, or context-menu link.
  document.addEventListener('pointerdown', event => {
    updateLink(event.target.closest?.('a[data-site-language]'));
  }, { passive: true });
  document.addEventListener('focusin', event => {
    updateLink(event.target.closest?.('a[data-site-language]'));
  });
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-site-language]');
    if (event.defaultPrevented || !updateLink(link)) return;
    if ((event.button != null && event.button !== 0 && event.button !== -1) ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    stopAutomatic();
    try { localStorage.setItem(preferenceKey, link.dataset.siteLanguage); } catch {}
    // Native anchor navigation works even when storage is unavailable.
  });

  // An explicit /en/ or /zh/ URL is shareable and never redirected by geolocation.
  if (!rootHome && !rootAI) return;
  const saved = storedPreference();
  if (saved) {
    location.replace(destination(saved).href);
    return;
  }
  if (typeof fetch !== 'function') return;

  // Do not move a visitor to a different page after they have started interacting.
  for (const event of ['pointerdown', 'keydown', 'wheel']) {
    document.addEventListener(event, stopAutomatic, { once: true, passive: true });
  }
  if (typeof AbortController === 'function') controller = new AbortController();
  deadline = setTimeout(stopAutomatic, 2500);
  const startURL = location.href;
  const countryCode = value => {
    const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'ZZ' ? code : null;
  };

  // Same-origin, nonblocking hint. The CDN sets X-Site-Country from client IP;
  // the static GitHub fallback returns { version: 1, country: null }.
  // Browser language is intentionally not used as a geographic signal.
  fetch(new URL('/site-region.txt', location.origin).href, {
    mode: 'same-origin', credentials: 'omit', cache: 'no-store', redirect: 'error',
    ...(controller ? { signal: controller.signal } : {}),
  }).then(async response => {
    if (!response.ok) return;
    const data = await response.json();
    if (!data || data.version !== 1) return;
    const country = countryCode(response.headers.get('X-Site-Country')) || countryCode(data.country);
    if (automaticCancelled || location.href !== startURL || storedPreference()) return;
    if (country === 'CN') location.replace(destination('zh').href);
  }).catch(() => {
    // Unknown, offline, malformed or slow hints leave the English homepage usable.
  }).finally(() => clearTimeout(deadline));
})();
