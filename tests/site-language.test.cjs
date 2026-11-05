const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/site-language.js'), 'utf8');

function setup({ url = 'https://stevencheninfilm.com/index.html', preference = null,
  storageDenied = false, browserLanguage = 'en-US', page = '-1', lang = 'en', workflow = null } = {}) {
  const location = new URL(url);
  const replacements = [];
  location.replace = target => replacements.push(target);
  const storage = new Map(preference ? [['steven-site-language', preference]] : []);
  const listeners = new Map(), timers = new Set(), requests = [];
  const card = { dataset: { page } };
  const links = ['en', 'zh'].map(language => ({
    dataset: { siteLanguage: language }, attributes: new Map(),
    href: `/${language}/index.html`,
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
    closest() { return this; },
  }));
  let resolveRegion, rejectRegion;
  vm.runInNewContext(source, {
    URL, AbortController, location, navigator: { language: browserLanguage, languages: [browserLanguage] },
    localStorage: {
      getItem(key) { if (storageDenied) throw new Error('blocked'); return storage.get(key) ?? null; },
      setItem(key, value) { if (storageDenied) throw new Error('blocked'); storage.set(key, value); },
    },
    document: {
      documentElement: { lang, clientHeight: 900 },
      querySelectorAll: () => links,
      querySelector: selector => selector.includes('data-workflow-item') ? workflow : card,
      addEventListener(name, listener) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(listener);
      },
    },
    setTimeout(callback) { timers.add(callback); return callback; },
    clearTimeout(callback) { timers.delete(callback); },
    fetch(url, options) {
      requests.push({ url, options });
      return new Promise((resolve, reject) => { resolveRegion = resolve; rejectRegion = reject; });
    },
  });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    location, replacements, storage, links, requests, card,
    fire(name, event = {}) {
      const ev = { target: { closest: () => null }, button: 0, defaultPrevented: false, ...event };
      (listeners.get(name) || []).forEach(callback => callback(ev));
      return ev;
    },
    async respond({ country = null, version = 1, header = null, ok = true, invalidJSON = false } = {}) {
      resolveRegion({ ok, headers: { get: name => name === 'X-Site-Country' ? header : null },
        json: async () => { if (invalidJSON) throw new SyntaxError('not JSON'); return { version, country }; } });
      await flush();
    },
    async fail() { rejectRegion(new TypeError('offline')); await flush(); },
    expire() { [...timers].forEach(callback => callback()); },
  };
}

test('root uses a nonblocking same-origin country endpoint, never browser language', async () => {
  const h = setup({ browserLanguage: 'zh-CN' });
  assert.deepEqual(h.replacements, []);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, 'https://stevencheninfilm.com/site-region.txt');
  assert.equal(h.requests[0].options.mode, 'same-origin');
  assert.equal(h.requests[0].options.cache, 'no-store');
  assert.equal(h.requests[0].options.credentials, 'omit');
  assert.equal(h.requests[0].options.redirect, 'error');
  await h.respond();
  assert.deepEqual(h.replacements, [], 'unknown geography retains the English homepage');
});

test('valid CDN country header overrides body and root routing preserves query/hash', async () => {
  const cn = setup({ url: 'https://stevencheninfilm.com/?project=0#featured-work' });
  await cn.respond({ header: 'CN', country: 'US' });
  assert.deepEqual(cn.replacements, ['https://stevencheninfilm.com/zh/index.html?project=0#featured-work']);
  const us = setup({ browserLanguage: 'zh-CN' });
  await us.respond({ header: 'US', country: 'CN' });
  assert.deepEqual(us.replacements, []);
  const bodyFallback = setup();
  await bodyFallback.respond({ header: 'XX', country: 'CN' });
  assert.deepEqual(bodyFallback.replacements, ['https://stevencheninfilm.com/zh/index.html']);
});

test('manual preference routes immediately without a region request', () => {
  for (const preference of ['en', 'zh']) {
    const h = setup({ preference, url: 'https://stevencheninfilm.com/index.html?project=8#featured-work' });
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.replacements, [`https://stevencheninfilm.com/${preference}/index.html?project=8#featured-work`]);
  }
});

test('explicit language pages remain stable even with a previous opposite preference', () => {
  for (const locale of ['en', 'zh']) {
    const h = setup({ url: `https://stevencheninfilm.com/${locale}/index.html`,
      preference: locale === 'en' ? 'zh' : 'en', lang: locale === 'zh' ? 'zh-Hans' : 'en' });
    assert.equal(h.requests.length, 0);
    assert.deepEqual(h.replacements, []);
    assert.equal(h.links.find(link => link.dataset.siteLanguage === locale).attributes.get('aria-current'), 'page');
  }
});

test('manual switch preserves current project and hash using native anchor navigation', () => {
  const h = setup({ url: 'https://stevencheninfilm.com/en/index.html?utm_source=portfolio#featured-work' });
  h.card.dataset.page = '9';
  const event = h.fire('click', { target: h.links[1] });
  assert.equal(event.defaultPrevented, false);
  assert.equal(h.links[1].href, 'https://stevencheninfilm.com/zh/index.html?utm_source=portfolio&project=9#featured-work');
  assert.equal(h.storage.get('steven-site-language'), 'zh');
  assert.deepEqual(h.replacements, []);
  h.card.dataset.page = '-1';
  h.fire('pointerdown', { target: h.links[0] });
  assert.equal(new URL(h.links[0].href).searchParams.get('project'), '-1');
  h.card.dataset.page = '12';
  h.fire('pointerdown', { target: h.links[0] });
  assert.equal(new URL(h.links[0].href).searchParams.get('project'), '12', 'future project IDs need no fixed maximum');
});

test('manual choice wins over a late country response, including blocked localStorage', async () => {
  for (const storageDenied of [false, true]) {
    const h = setup({ storageDenied });
    h.fire('click', { target: h.links[0] });
    assert.equal(h.requests[0].options.signal.aborted, true);
    await h.respond({ header: 'CN' });
    assert.deepEqual(h.replacements, []);
    assert.match(h.links[0].href, /\/en\/index\.html\?project=-1$/);
  }
});

test('slow, failed, invalid and unsupported country responses leave the homepage available', async () => {
  for (const response of [{ ok: false, header: 'CN' }, { invalidJSON: true, header: 'CN' },
    { version: 2, header: 'CN' }, { country: 'zh-CN' }, { header: 'XX' }]) {
    const h = setup(); await h.respond(response); assert.deepEqual(h.replacements, []);
  }
  const offline = setup(); await offline.fail(); assert.deepEqual(offline.replacements, []);
  const slow = setup(); slow.expire(); await slow.respond({ header: 'CN' });
  assert.deepEqual(slow.replacements, []);
  assert.equal(slow.requests[0].options.signal.aborted, true);
});

test('interaction, changed URL and a concurrent manual preference cancel automatic navigation', async () => {
  for (const event of ['pointerdown', 'keydown', 'wheel']) {
    const h = setup(); h.fire(event); await h.respond({ header: 'CN' });
    assert.deepEqual(h.replacements, []);
  }
  const moved = setup(); moved.location.hash = '#different-project'; await moved.respond({ country: 'CN' });
  assert.deepEqual(moved.replacements, []);
  const otherTab = setup(); otherTab.storage.set('steven-site-language', 'en'); await otherTab.respond({ country: 'CN' });
  assert.deepEqual(otherTab.replacements, []);
});

test('modified and cancelled clicks preserve browser behavior and do not save a preference', () => {
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    const h = setup({ url: 'https://stevencheninfilm.com/en/index.html' });
    h.fire('click', { target: h.links[1], ...options });
    assert.equal(h.storage.has('steven-site-language'), false);
    assert.deepEqual(h.replacements, []);
  }
});

test('static endpoint explicitly declares unknown geography under the versioned contract', () => {
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname, '../site-region.txt'), 'utf8')),
    { version: 1, country: null });
});

test('AI root entry uses the same preference and regional defaults without returning to the homepage', async () => {
  const saved = setup({ url: 'https://stevencheninfilm.com/ai/index.html#dlss-detail', preference: 'zh' });
  assert.equal(saved.requests.length, 0);
  assert.deepEqual(saved.replacements, ['https://stevencheninfilm.com/zh/ai/index.html#dlss-detail']);
  const cn = setup({ url: 'https://stevencheninfilm.com/ai/?source=work#real-cinema-to-ai' });
  await cn.respond({ header: 'CN' });
  assert.deepEqual(cn.replacements, ['https://stevencheninfilm.com/zh/ai/index.html?source=work#real-cinema-to-ai']);
  for (const locale of ['en', 'zh']) {
    const explicit = setup({ url: `https://stevencheninfilm.com/${locale}/ai/index.html#camera-previs-to-ai`,
      preference: locale === 'en' ? 'zh' : 'en', lang: locale === 'zh' ? 'zh-Hans' : 'en' });
    assert.equal(explicit.requests.length, 0);
    assert.deepEqual(explicit.replacements, []);
    assert.equal(new URL(explicit.links[0].href).pathname, '/en/ai/index.html');
    assert.equal(new URL(explicit.links[1].href).pathname, '/zh/ai/index.html');
  }
});

test('AI language switch follows the visible workflow after scrolling and preserves query parameters', () => {
  const workflow = { id: 'real-cinema-to-ai', getBoundingClientRect: () => ({ top: 180, bottom: 760 }) };
  const h = setup({ url: 'https://stevencheninfilm.com/zh/ai/index.html?source=work#dlss-detail', lang: 'zh-Hans', workflow });
  h.fire('click', { target: h.links[0] });
  assert.equal(h.links[0].href, 'https://stevencheninfilm.com/en/ai/index.html?source=work#real-cinema-to-ai');
  assert.equal(h.storage.get('steven-site-language'), 'en');
  workflow.getBoundingClientRect = () => ({ top: -900, bottom: -100 });
  h.location.hash = '#feel';
  h.fire('pointerdown', { target: h.links[1] });
  assert.equal(new URL(h.links[1].href).hash, '#feel', 'an offscreen workflow cannot replace another project anchor');
});

test('Avocado AI root uses regional and saved defaults within its own page family', async () => {
  for (const preference of ['en', 'zh']) {
    const saved = setup({ url: 'https://stevencheninfilm.com/avocado-ai/index.html?source=home&project=2#roadster', preference });
    assert.equal(saved.requests.length, 0);
    assert.deepEqual(saved.replacements, [`https://stevencheninfilm.com/${preference}/avocado-ai/index.html?source=home#roadster`]);
  }
  for (const pathname of ['/avocado-ai', '/avocado-ai/', '/avocado-ai/index.html']) {
    const cn = setup({ url: `https://stevencheninfilm.com${pathname}?source=douyin&project=-1#tesla` });
    await cn.respond({ header: 'CN' });
    assert.deepEqual(cn.replacements, ['https://stevencheninfilm.com/zh/avocado-ai/index.html?source=douyin#tesla']);
  }
  const overseas = setup({ url: 'https://stevencheninfilm.com/avocado-ai/index.html', browserLanguage: 'zh-CN' });
  await overseas.respond({ header: 'US' });
  assert.deepEqual(overseas.replacements, [], 'overseas visitors keep the original English entry');
});

test('Avocado AI language links preserve film anchors without inheriting homepage project state', () => {
  for (const locale of ['en', 'zh']) {
    const h = setup({ url: `https://stevencheninfilm.com/${locale}/avocado-ai/index.html?source=home&project=1#roadster`,
      preference: locale === 'en' ? 'zh' : 'en', lang: locale === 'zh' ? 'zh-Hans' : 'en', page: '8',
      workflow: { id: 'dlss-detail', getBoundingClientRect: () => ({ top: 120, bottom: 800 }) } });
    assert.equal(h.requests.length, 0, 'explicit language entries do not geolocate');
    assert.deepEqual(h.replacements, []);
    for (const link of h.links) {
      h.fire('pointerdown', { target: link });
      assert.equal(link.href, `https://stevencheninfilm.com/${link.dataset.siteLanguage}/avocado-ai/index.html?source=home#roadster`);
    }
    h.fire('click', { target: h.links[1] });
    assert.equal(h.storage.get('steven-site-language'), 'zh');
    assert.deepEqual(h.replacements, [], 'manual switching remains normal anchor navigation');
  }
});

test('Avocado AI manual selection cancels a late region redirect and keeps its film anchor', async () => {
  const h = setup({ url: 'https://stevencheninfilm.com/avocado-ai/index.html?project=0#tesla', storageDenied: true });
  h.fire('click', { target: h.links[0] });
  await h.respond({ header: 'CN' });
  assert.deepEqual(h.replacements, []);
  assert.equal(h.links[0].href, 'https://stevencheninfilm.com/en/avocado-ai/index.html#tesla');
});
