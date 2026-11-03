const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function target(extra = {}) {
  const listeners = new Map();
  const classes = new Set();
  return Object.assign({
    hidden: false, style: { setProperty() {} }, dataset: {},
    classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n) },
    addEventListener(name, callback) { const list = listeners.get(name) || []; list.push(callback); listeners.set(name, list); },
    removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(fn => fn !== callback)); },
    emit(name, event = {}) { for (const callback of [...(listeners.get(name) || [])]) callback(event); },
    dispatchEvent(event) { this.emit(event.type, event); },
    setAttribute() {}, hasAttribute() { return false; }, focus() {}
  }, extra);
}

function setup({ active = 0, reduced = false, mobile = false, home = true, hidden = false } = {}) {
  const requests = [], observers = [], timers = new Map();
  let timerId = 0;
  const motion = target({ matches: reduced });
  const deck = target();
  const groups = [0, 1].map(index => {
    const card = target({ closest: () => deck });
    if (index === active) card.classList.add('is-active');
    const videos = ['before', 'after'].map(side => target({
      dataset: { src: `/${index}-${side}.mp4`, srcMobile: `/${index}-${side}-mobile.mp4` },
      readyState: 0, paused: true, autoplay: false,
      pause() { this.paused = true; },
      play() { this.paused = false; return Promise.resolve(); },
      load() { this.readyState = 3; this.emit('canplay'); },
      getAttribute() { return ''; }, querySelector() { return null; }
    }));
    const output = target(), label = target(), progress = target(), status = target(), retry = target({ hidden: true }), control = target();
    const overlay = target({ querySelector: selector => ({ output, '.video-loading-meta span': label, '[role="progressbar"]': progress, '.video-loading-status': status, '.video-loading-retry': retry })[selector] });
    const group = target({
      closest: selector => selector === '.deck-card--comparison' && home ? card : null,
      querySelectorAll: selector => selector === 'video' ? videos : [control],
      querySelector: () => overlay,
      hasAttribute: name => name === 'data-video-static-on-reduced-motion'
    });
    return { group, card, videos, overlay, retry, control, status };
  });
  const document = target({ hidden, querySelectorAll: () => groups.map(item => item.group) });
  const window = target({ matchMedia: query => query.includes('reduced-motion') ? motion : { matches: mobile }, setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id) });
  class XHR extends EventTarget {
    constructor() { super(); this.aborted = false; }
    open(method, url) { this.url = url; }
    send() { requests.push(this); }
    abort() { this.aborted = true; this.dispatchEvent(new Event('abort')); }
    complete() { this.status = 200; this.response = new Blob(['video']); this.dispatchEvent(new Event('load')); }
    fail() { this.dispatchEvent(new Event('error')); }
  }
  vm.runInNewContext(read('assets/video-loader.js'), {
    document, window, navigator: { onLine: true }, location: { protocol: 'https:' },
    HTMLMediaElement: { HAVE_FUTURE_DATA: 3 }, Blob, XMLHttpRequest: XHR, DOMException,
    URL: { createObjectURL: () => 'blob:video', revokeObjectURL() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe(element) { observers.push({ element, callback: this.callback }); } }
  });
  const notify = element => observers.filter(item => item.element === element).forEach(item => item.callback());
  return { requests, groups, deck, document, motion, window,
    setActive(index) { groups.forEach((item, i) => { item.card.classList[i === index ? 'add' : 'remove']('is-active'); notify(item.card); }); },
    setStrip(value) { deck.classList[value ? 'add' : 'remove']('is-strip'); notify(deck); },
    setReduced(value) { motion.matches = value; motion.emit('change', { matches: value }); },
    async settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); },
    finishTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }
  };
}

test('homepage fetches only the active comparison and uses mobile sources', async () => {
  const app = setup({ mobile: true });
  assert.deepEqual(app.requests.map(request => request.url), ['/0-before-mobile.mp4', '/0-after-mobile.mp4']);
  app.setStrip(true);
  app.setActive(1);
  assert.equal(app.requests.length, 2, 'browsing thumbnail strips must not fetch the next comparison');
  app.setStrip(false);
  assert.deepEqual(app.requests.slice(2).map(request => request.url), ['/1-before-mobile.mp4', '/1-after-mobile.mp4']);
  app.setActive(0); app.setActive(1);
  assert.equal(app.requests.length, 4, 'class changes must not restart an ongoing transfer');
  app.requests.forEach(request => request.complete());
  await app.settle(); app.finishTimers();
  assert.ok(app.groups.every(item => item.overlay.hidden && !item.control.disabled));
  app.window.emit('pageshow', { persisted: true });
  assert.equal(app.requests.length, 4, 'bfcache restores ready pairs without downloading again');
});

test('reduced motion keeps posters and delays downloads until an active expanded visit', async () => {
  const app = setup({ reduced: true });
  assert.equal(app.requests.length, 0);
  assert.equal(app.groups[0].control.disabled, false);
  app.setStrip(true); app.setActive(1); app.setReduced(false);
  assert.equal(app.requests.length, 0);
  app.setStrip(false);
  assert.equal(app.requests.length, 2);
  app.setActive(0);
  app.setReduced(true);
  assert.ok(app.requests.every(request => request.aborted), 'reduce motion aborts both active and now-inactive transfers');
  app.setStrip(true); app.setReduced(false);
  const count = app.requests.length;
  assert.equal(count, 4);
  app.setStrip(false);
  assert.equal(app.requests.length, count + 2);
  app.requests.slice(count).forEach(request => request.complete());
  await app.settle();
  assert.equal(app.groups[0].control.disabled, false);
});

test('failed comparison can retry and inactive failures do not auto-retry', async () => {
  const app = setup();
  app.requests[0].fail(); await app.settle();
  assert.equal(app.groups[0].retry.hidden, false);
  app.setActive(1); app.setActive(0);
  assert.equal(app.requests.length, 4, 'returning preserves the explicit Retry action');
  app.groups[0].retry.emit('click');
  assert.equal(app.requests.length, 6);
  app.requests.slice(4).forEach(request => request.complete());
  await app.settle(); app.finishTimers();
  assert.equal(app.groups[0].overlay.hidden, true);
  assert.equal(app.groups[0].control.disabled, false);
});

test('hidden home waits for visibility while non-home video groups retain immediate loading', () => {
  const app = setup({ hidden: true });
  assert.equal(app.requests.length, 0);
  app.document.hidden = false; app.document.emit('visibilitychange');
  assert.equal(app.requests.length, 2);
  const other = setup({ home: false, hidden: true });
  assert.equal(other.requests.length, 4);
});

test('deck and strip helpers leave comparison video hydration to its paired loader', async () => {
  const video = { dataset: { src: '/desktop.mp4' }, load() { throw new Error('comparison must not hydrate here'); } };
  const card = { dataset: {}, classList: { contains: name => name === 'deck-card--comparison' }, querySelector: () => video };
  const ensure = read('assets/site.js').match(/const ensureCardMedia = \(index\) => \{[\s\S]*?\n  \};/)[0];
  await vm.runInNewContext(`${ensure}; ensureCardMedia`, { cards: [card] })(0);
  const prepare = read('assets/home-v2.js').match(/const prepareCardMedia = \(card\) => \{[\s\S]*?\n  \};/)[0];
  vm.runInNewContext(`${prepare}; prepareCardMedia`)(card);
  assert.equal(video.src, undefined);
  assert.equal(card.dataset.mediaLoaded, undefined);
});
