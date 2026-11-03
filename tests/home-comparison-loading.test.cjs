const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function target(extra = {}) {
  const listeners = new Map(), classes = new Set();
  return Object.assign({
    hidden: false, attrs: {}, style: { setProperty() {} }, dataset: {},
    classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n) },
    addEventListener(name, callback) { const list = listeners.get(name) || []; list.push(callback); listeners.set(name, list); },
    removeEventListener(name, callback) { listeners.set(name, (listeners.get(name) || []).filter(fn => fn !== callback)); },
    emit(name, event = {}) { for (const callback of [...(listeners.get(name) || [])]) callback(event); },
    dispatchEvent(event) { this.emit(event.type, event); },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    getAttribute(name) { return this.attrs[name] || ''; },
    hasAttribute(name) { return name in this.attrs; }, focus() { this.focused = true; }
  }, extra);
}

function setup({ active = 0, reduced = false, mobile = false, home = true, hidden = false, zh = false } = {}) {
  const requests = [], observers = [], intersections = [], timers = new Map();
  let timerId = 0, now = 0;
  const motion = target({ matches: reduced });
  const deck = target();
  const groups = [0, 1].map(index => {
    const card = target({ closest: () => deck });
    if (index === active) card.classList.add('is-active');
    const videos = ['before', 'after'].map(side => {
      const video = target({
        dataset: { src: `/${index}-${side}.mp4`, srcMobile: `/${index}-${side}-mobile.mp4` },
        readyState: 0, paused: true, autoplay: !home, duration: 30, currentTime: 0,
        pause() { this.paused = true; },
        play() { this.paused = false; return Promise.resolve(); },
        load() {
          if (this.currentRequest) this.currentRequest.cancelled = true;
          this.readyState = 0;
          if (this.src) {
            this.currentRequest = { url: this.src, video: this, cancelled: false };
            requests.push(this.currentRequest);
          } else this.currentRequest = null;
        },
        metadata() { this.readyState = 1; this.emit('loadedmetadata'); },
        firstFrame() { this.readyState = 2; this.emit('loadeddata'); },
        canPlay() { this.readyState = 3; this.emit('canplay'); },
        querySelector() { return null; }
      });
      Object.defineProperty(video, 'src', { get() { return this.attrs.src || ''; }, set(value) { this.attrs.src = value; } });
      return video;
    });
    const output = target(), label = target(), progress = target(), status = target(), retry = target({ hidden: true }), control = target();
    const overlay = target({ querySelector: selector => ({ output, '.video-loading-meta span': label, '[role="progressbar"]': progress, '.video-loading-status': status, '.video-loading-retry': retry })[selector] });
    const group = target({
      dataset: zh ? { videoLang: 'zh', videoLoadingLabel: '对比视频加载中' } : {},
      closest: selector => selector === '.deck-card--comparison' && home ? card : null,
      querySelectorAll: selector => selector === 'video' ? videos : [control],
      querySelector: () => overlay,
      hasAttribute: name => name === 'data-video-static-on-reduced-motion'
    });
    return { group, card, videos, overlay, retry, control, status, output, progress, label };
  });
  const document = target({ hidden, querySelectorAll: () => groups.map(item => item.group) });
  const window = target({ IntersectionObserver: true,
    matchMedia: query => query.includes('reduced-motion') ? motion : { matches: mobile },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, at: now + delay }); return timerId; }, clearTimeout: id => timers.delete(id)
  });
  vm.runInNewContext(read('assets/video-loader.js'), {
    document, window, navigator: { onLine: true }, HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
    XMLHttpRequest: class { constructor() { throw Error('whole-file XHR must never be used'); } },
    URL: { createObjectURL() { throw Error('video playback must not wait for a Blob'); } },
    CustomEvent: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe(element) { observers.push({ element, callback: this.callback }); } },
    IntersectionObserver: class { constructor(callback) { this.callback = callback; } observe(element) { intersections.push({ element, callback: this.callback }); } }
  });
  const notify = element => observers.filter(item => item.element === element).forEach(item => item.callback());
  return { requests, groups, deck, document, motion, window,
    setActive(index) { groups.forEach((item, i) => { item.card.classList[i === index ? 'add' : 'remove']('is-active'); notify(item.card); }); },
    setStrip(value) { deck.classList[value ? 'add' : 'remove']('is-strip'); notify(deck); },
    setReduced(value) { motion.matches = value; motion.emit('change', { matches: value }); },
    intersect(index, value) { intersections.filter(item => item.element === groups[index].group).forEach(item => item.callback([{ isIntersecting: value }])); },
    advance(ms) { now += ms; for (const [id, item] of [...timers]) if (item.at <= now) { timers.delete(id); item.callback(); } }
  };
}

const readyPair = pair => pair.videos.forEach(video => { video.metadata(); video.firstFrame(); });

test('native progressive pairs become ready after their first frames without downloading entire files', () => {
  const app = setup({ mobile: true, zh: true });
  const pair = app.groups[0];
  assert.deepEqual(app.requests.map(request => request.url), ['/0-before-mobile.mp4', '/0-after-mobile.mp4']);
  assert.ok(pair.videos.every(video => video.preload === 'auto' && video.dataset.videoLoaderReady === 'false'));
  assert.equal(pair.overlay.hidden, true, 'fast loads do not flash a loading overlay');
  assert.equal(pair.control.disabled, false, 'poster comparison stays interactive while loading');
  assert.equal(pair.output.hidden, true); assert.equal(pair.output.textContent, '');
  assert.equal(pair.progress.hidden, true);
  pair.videos.forEach(video => video.metadata());
  app.advance(700);
  assert.equal(pair.overlay.hidden, false);
  assert.equal(pair.label.textContent, '对比视频加载中');
  pair.videos[0].firstFrame();
  assert.ok(pair.videos.every(video => video.dataset.videoLoaderReady === 'false'), 'both sides must have a frame');
  pair.videos[1].firstFrame();
  assert.equal(pair.overlay.hidden, true);
  assert.ok(pair.videos.every(video => video.dataset.videoLoaderReady === 'true'));
  app.advance(30000);
  assert.equal(pair.overlay.hidden, true, 'the old startup deadline cannot revive a ready overlay');
  app.window.emit('pageshow', { persisted: true });
  assert.equal(app.requests.length, 2, 'bfcache reuses the native media buffers');
});

test('unvisited comparisons stay unloaded and leaving cancels only unfinished streams', () => {
  const app = setup();
  assert.equal(app.groups[1].overlay.hidden, true);
  app.groups[0].videos.forEach(video => { video.metadata(); video.currentTime = 5.25; });
  app.setStrip(true);
  assert.ok(app.requests.every(request => request.cancelled));
  assert.ok(app.groups[0].videos.every(video => !video.src && video.preload === 'none'));
  app.setActive(1);
  assert.equal(app.requests.length, 2, 'strip selection must not open video connections');
  app.setStrip(false);
  assert.equal(app.requests.length, 4);
  readyPair(app.groups[1]);
  app.setActive(0);
  assert.equal(app.requests.length, 6);
  readyPair(app.groups[0]);
  assert.ok(app.groups[0].videos.every(video => video.currentTime === 5.25), 'cancelled startup preserves its selected opening frame');
  app.setActive(1);
  assert.equal(app.requests.length, 6, 'ready inactive pairs retain their sources');
  assert.ok(app.requests.slice(2, 4).every(request => !request.cancelled));
});

test('startup is bounded with localized Retry and can recover from late first frames', () => {
  const app = setup({ zh: true }), pair = app.groups[0];
  app.advance(18000);
  assert.equal(pair.retry.hidden, false);
  assert.equal(pair.retry.textContent, '重试');
  assert.equal(pair.label.textContent, '视频暂时无法加载');
  assert.equal(pair.control.disabled, false);
  assert.equal(pair.output.textContent, '', 'there is no invented 99-percent wait');
  readyPair(pair);
  assert.equal(pair.overlay.hidden, true, 'late native readiness recovers without requiring a click');
  assert.ok(pair.videos.every(video => video.dataset.videoLoaderReady === 'true'));
});

test('a native load error can retry without stale timers or automatic offscreen retry', () => {
  const app = setup(), pair = app.groups[0];
  pair.videos[0].emit('error');
  assert.equal(pair.retry.hidden, false);
  app.setActive(1); app.setActive(0);
  assert.equal(app.requests.length, 4, 'returning to a failed project preserves Retry');
  pair.retry.emit('click');
  assert.equal(app.requests.length, 6);
  readyPair(pair);
  app.advance(30000);
  assert.equal(pair.overlay.hidden, true);
  assert.equal(pair.control.disabled, false);
  assert.equal(pair.control.focused, true);
});

test('reduced motion preserves posters, stops unfinished streams, and waits for an active visit', () => {
  const app = setup({ reduced: true });
  assert.equal(app.requests.length, 0);
  assert.equal(app.groups[0].control.disabled, false);
  app.setStrip(true); app.setActive(1); app.setReduced(false);
  assert.equal(app.requests.length, 0);
  app.setStrip(false);
  assert.equal(app.requests.length, 2);
  app.setReduced(true);
  assert.ok(app.requests.every(request => request.cancelled));
  assert.equal(app.groups[1].overlay.hidden, true);
  app.setReduced(false);
  assert.equal(app.requests.length, 4);
  readyPair(app.groups[1]);
  app.setReduced(true); app.setReduced(false);
  assert.equal(app.requests.length, 4, 'already ready streams are retained across reduced-motion changes');
});

test('non-home media loads on viewport entry and hidden home media waits for visibility', () => {
  const app = setup({ hidden: true });
  assert.equal(app.requests.length, 0);
  app.document.hidden = false; app.document.emit('visibilitychange');
  assert.equal(app.requests.length, 2);
  app.document.hidden = true; app.document.emit('visibilitychange');
  assert.ok(app.requests.every(request => request.cancelled));
  const other = setup({ home: false });
  assert.equal(other.requests.length, 0, 'below-the-fold non-home video is lazy too');
  other.intersect(0, true);
  assert.equal(other.requests.length, 2);
  readyPair(other.groups[0]);
  assert.ok(other.groups[0].videos.every(video => !video.paused));
  other.intersect(0, false);
  assert.ok(other.groups[0].videos.every(video => video.paused));
  other.intersect(1, true); other.intersect(1, false);
  assert.ok(other.requests.slice(2).every(request => request.cancelled));
});

test('blocked home autoplay offers a gesture-driven Play action without reloading', () => {
  const app = setup({ zh: true }), pair = app.groups[0];
  readyPair(pair);
  pair.group.emit('video-loader:play-blocked');
  assert.equal(pair.retry.textContent, '点击播放');
  assert.equal(pair.retry.hidden, false);
  let plays = 0;
  pair.videos.forEach(video => video.addEventListener('video-loader:play', () => { plays++; }));
  pair.retry.emit('click');
  assert.equal(plays, 2, 'play gestures reach the pair controller synchronously');
  assert.equal(app.requests.length, 2);
  assert.ok(pair.videos.every(video => video.dataset.videoLoaderReady === 'true'));
});

test('deck and strip helpers leave comparison video hydration to its paired loader', async () => {
  const video = { dataset: { src: '/desktop.mp4' }, load() { throw new Error('comparison must not hydrate here'); } };
  const card = { dataset: {}, classList: { contains: name => name === 'deck-card--comparison' }, querySelector: () => video, querySelectorAll: () => [] };
  const ensure = read('assets/site.js').match(/const ensureCardMedia = \(index, preview = false\) => \{[\s\S]*?\n  \};/)[0];
  await vm.runInNewContext(`${ensure}; ensureCardMedia`, { cards: [card] })(0);
  const prepare = read('assets/home-v2.js').match(/const prepareCardMedia = \(card\) => \{[\s\S]*?\n  \};/)[0];
  vm.runInNewContext(`${prepare}; prepareCardMedia`)(card);
  assert.equal(video.src, undefined);
  assert.equal(card.dataset.mediaLoaded, undefined);
});
