const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/banner-v3.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function element(extra = {}) {
  const classes = new Set(), listeners = new Map();
  return Object.assign({
    dataset: {}, attrs: {}, properties: {},
    classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: n => classes.has(n) },
    style: { setProperty() {} },
    addEventListener(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); },
    removeEventListener(name, fn) { listeners.set(name, (listeners.get(name) || []).filter(callback => callback !== fn)); },
    fire(name, event = {}) { [...(listeners.get(name) || [])].forEach(fn => fn(event)); },
    setAttribute(name, value) { this.attrs[name] = value; },
    setPointerCapture() {}, hasPointerCapture() { return false; }
  }, extra);
}

function setup({ mobile = false, reduced = false, loading = false, managed = false } = {}) {
  const observers = [], frames = new Map();
  let frameId = 0, timerId = 0;
  const timers = new Map();
  const deck = element(), body = element(), motion = element({ matches: reduced });
  if (loading) body.classList.add('is-v3-loading');
  const pairs = [0, 1].map(index => {
    const card = element();
    if (index === 0) card.classList.add('is-active');
    const frame = element({ getBoundingClientRect: () => ({ left: 0, width: 1000 }) });
    const handle = element();
    const videos = ['before', 'after'].map(side => element({
      dataset: { src: `${index}-${side}.mp4`, srcMobile: `${index}-${side}-mobile.mp4`, ...(managed ? { videoLoaderManaged: 'true' } : {}) },
      currentTime: 0, duration: 20, playbackRate: 1, readyState: 0, paused: true, muted: false, loads: 0,
      removeAttribute(name) { if (name === 'data-src') delete this.dataset.src; if (name === 'data-src-mobile') delete this.dataset.srcMobile; },
      metadata() { this.readyState = 1; this.fire('loadedmetadata'); },
      load() { this.loads++; this.metadata(); },
      play() { if (this.paused) { this.paused = false; this.fire('play'); } return Promise.resolve(); },
      pause() { if (!this.paused) { this.paused = true; this.fire('pause'); } },
      requestVideoFrameCallback(fn) { frames.set(++frameId, fn); return frameId; },
      cancelVideoFrameCallback(id) { frames.delete(id); }
    }));
    const stage = element({
      dataset: index === 0 ? { startTime: '0', beforeLabel: '原始画面', afterLabel: '增强细节' } : {},
      closest: selector => selector === '.deck-card' ? card : deck,
      querySelector: selector => ({ '.comparison-frame': frame, '.comparison-handle': handle, '.comparison-video--before': videos[0], '.comparison-video--after': videos[1] })[selector]
    });
    stage.style.setProperty = (name, value) => { stage.properties[name] = value; };
    return { stage, card, frame, handle, videos };
  });
  const document = element({ body, hidden: false, querySelectorAll: () => pairs.map(pair => pair.stage) });
  const window = { matchMedia: query => query.includes('reduced-motion') ? motion : { matches: mobile }, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
  vm.runInNewContext(source, { document, window, MutationObserver: class { constructor(fn) { this.fn = fn; } observe(target) { observers.push({ target, fn: this.fn }); } } });
  const notify = target => observers.filter(observer => observer.target === target).forEach(observer => observer.fn());
  return { pairs, document, deck, body, frames,
    select(index) { pairs.forEach((pair, i) => { pair.card.classList[i === index ? 'add' : 'remove']('is-active'); notify(pair.card); }); },
    strip(value) { deck.classList[value ? 'add' : 'remove']('is-strip'); notify(deck); },
    opening(value) { body.classList[value ? 'add' : 'remove']('is-v3-loading'); notify(body); },
    reduced(value) { motion.matches = value; motion.fire('change', { matches: value }); },
    key(index, key) { const event = { key, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; pairs[index].handle.fire('keydown', event); return event; }
  };
}

test('two comparisons load independently and preserve their own opening frames', async () => {
  const app = setup({ mobile: true });
  await flush();
  assert.deepEqual(app.pairs[0].videos.map(video => video.src), ['0-before-mobile.mp4', '0-after-mobile.mp4']);
  assert.ok(app.pairs[0].videos.every(video => !video.paused && video.muted && video.currentTime === 0));
  assert.ok(app.pairs[1].videos.every(video => video.loads === 0 && video.paused));
  assert.equal(app.pairs[0].handle.tabIndex, 0);
  assert.equal(app.pairs[1].handle.tabIndex, -1);
  app.select(1); await flush();
  assert.ok(app.pairs[0].videos.every(video => video.paused));
  assert.ok(app.pairs[1].videos.every(video => !video.paused && video.currentTime === 5.25), 'the existing project keeps its 5.25-second opening');
  app.pairs[1].videos[1].currentTime = 9;
  app.pairs[1].videos[1].fire('timeupdate');
  assert.equal(app.pairs[1].videos[0].currentTime, 9);
  assert.equal(app.pairs[0].videos[0].currentTime, 0, 'syncing one stage must not seek the other stage');
  app.select(0); await flush();
  assert.ok(app.pairs[0].videos.every(video => video.loads === 1 && !video.paused));
});

test('keyboard reveal updates only its own divider and localized labels', async () => {
  const app = setup(); await flush();
  const event = app.key(0, 'ArrowRight');
  assert.ok(event.prevented && event.stopped, 'slider keys must not navigate the project deck');
  assert.equal(app.pairs[0].handle.attrs['aria-valuenow'], '52');
  assert.equal(app.pairs[0].handle.attrs['aria-valuetext'], '52% 原始画面, 48% 增强细节');
  assert.equal(app.pairs[1].handle.attrs['aria-valuenow'], '50');
  app.select(1); await flush();
  app.key(1, 'End');
  assert.equal(app.pairs[1].handle.attrs['aria-valuetext'], '96% 3D previs, 4% AI render');
  assert.equal(app.pairs[1].stage.properties['--compare-split'], '96%');
  assert.equal(app.pairs[0].stage.properties['--compare-split'], '52%');
  app.key(1, 'Home');
  assert.equal(app.pairs[1].handle.attrs['aria-valuenow'], '4');
});

test('opening animation, strip mode, and hidden page suspend both video pairs', async () => {
  const app = setup({ loading: true });
  await flush();
  assert.ok(app.pairs.every(pair => pair.videos.every(video => video.loads === 0)));
  app.opening(false); await flush();
  assert.ok(app.pairs[0].videos.every(video => !video.paused));
  app.strip(true);
  assert.ok(app.pairs.every(pair => pair.videos.every(video => video.paused)));
  assert.equal(app.frames.size, 0);
  assert.ok(app.pairs.every(pair => pair.handle.tabIndex === -1));
  app.select(1); await flush();
  assert.ok(app.pairs[1].videos.every(video => video.loads === 0));
  app.strip(false); await flush();
  assert.ok(app.pairs[1].videos.every(video => !video.paused));
  app.document.hidden = true; app.document.fire('visibilitychange');
  assert.ok(app.pairs.every(pair => pair.videos.every(video => video.paused)));
  app.document.hidden = false; app.document.fire('visibilitychange'); await flush();
  assert.ok(app.pairs[1].videos.every(video => !video.paused));
  assert.ok(app.pairs[0].videos.every(video => video.paused));
});

test('reduced motion keeps both posters static and resets reveal without loading inactive media', async () => {
  const app = setup({ reduced: true }); await flush();
  assert.ok(app.pairs.every(pair => pair.videos.every(video => video.loads === 0 && video.paused)));
  app.key(0, 'ArrowRight');
  app.reduced(false); await flush();
  assert.ok(app.pairs[0].videos.every(video => video.loads === 1 && !video.paused));
  assert.ok(app.pairs[1].videos.every(video => video.loads === 0));
  app.reduced(true);
  assert.ok(app.pairs.every(pair => pair.videos.every(video => video.paused)));
  assert.ok(app.pairs.every(pair => pair.handle.attrs['aria-valuenow'] === '50'));
  assert.equal(app.frames.size, 0);
});

test('managed pairs wait for both metadata events without overriding loader-selected sources', async () => {
  const app = setup({ managed: true });
  const [before, after] = app.pairs[0].videos;
  before.src = 'blob:before'; after.src = 'blob:after';
  before.metadata(); await flush();
  assert.ok(before.paused && after.paused, 'neither side starts before both are ready');
  after.metadata(); await flush();
  assert.equal(before.src, 'blob:before'); assert.equal(after.src, 'blob:after');
  assert.equal(before.loads + after.loads, 0);
  assert.ok(!before.paused && !after.paused);
  app.pairs[1].videos.forEach(video => video.fire('video-loader:ready'));
  await flush();
  assert.ok(app.pairs[1].videos.every(video => video.paused && video.loads === 0));
});
