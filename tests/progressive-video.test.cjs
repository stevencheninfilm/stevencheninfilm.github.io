const test = require('node:test');
const assert = require('node:assert/strict');
const { install, createTransaction, fetchBlob } = require('../assets/progressive-video.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

class Media extends EventTarget {
  constructor(src = '', { failHD = false } = {}) {
    super(); this.src = src; this.currentSrc = src; this._time = 0;
    this.readyState = src ? 3 : 0; this.paused = true; this.seeking = false;
    this.muted = true; this.defaultMuted = true; this.volume = .7;
    this.playbackRate = 1; this.loop = true; this.duration = 20;
    this.error = null; this.loads = []; this.failHD = failHD;
  }
  get currentTime() { return this._time; }
  set currentTime(value) {
    this._time = value;
    this.seeking = true;
    this.dispatchEvent(new Event('seeking'));
    queueMicrotask(() => { this.seeking = false; this.dispatchEvent(new Event('seeked')); });
  }
  getAttribute(name) { return name === 'src' ? this.src : null; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  load() {
    const source = this.src;
    this.loads.push(source); this.readyState = 0; this._time = 0; this.error = null;
    queueMicrotask(() => {
      if (this.src !== source || !source) return;
      this.currentSrc = source;
      if (this.failHD && source.startsWith('blob:')) {
        this.error = { code: 3 }; this.dispatchEvent(new Event('error')); return;
      }
      this.readyState = 3;
      for (const name of ['loadedmetadata', 'loadeddata', 'canplay']) this.dispatchEvent(new Event(name));
    });
  }
  pause() { const changed = !this.paused; this.paused = true; if (changed) this.dispatchEvent(new Event('pause')); }
  play() { const changed = this.paused; this.paused = false; if (changed) this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  remove() {}
}
const response = (bytes = 10) => ({ ok: true, type: 'basic', headers: { get: name => name === 'content-length' ? String(bytes) : 'video/mp4' }, blob: async () => new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }) });
function setup({ pair = true, fetcher = async () => response(), onState = () => {}, createDecoder = () => new Media(), videos, ...rest } = {}) {
  videos ||= pair ? [new Media('low-before.mp4'), new Media('low-after.mp4')] : [new Media('low.mp4')];
  videos.forEach((video, i) => { video._time = i ? 8 : 7.9; video.paused = false; });
  const urls = [], revoked = [], states = [], covers = [];
  const transaction = createTransaction({ videos, sources: videos.map((_, i) => `hd-${i}.mp4`), fetcher,
    createDecoder, createURL(blob) { const url = `blob:hd-${urls.length}`; urls.push({ url, bytes: blob.size }); return url; },
    revokeURL: url => revoked.push(url),
    makeCover(video) { const cover = { video, removed: false }; covers.push(cover); return () => { cover.removed = true; }; },
    onState(state, detail) { states.push(state); return onState(state, detail); }, ...rest });
  return { transaction, videos, urls, revoked, states, covers };
}

test('the complete HD group downloads and decodes before either preview source changes', async () => {
  const waiting = [];
  const s = setup({ fetcher: () => new Promise(resolve => waiting.push(resolve)) });
  const done = s.transaction.run();
  assert.equal(waiting.length, 1, 'members download sequentially within the current group');
  waiting.shift()(response()); await flush();
  assert.equal(waiting.length, 1);
  assert.ok(s.videos.every(video => video.src.startsWith('low-') && !video.paused));
  waiting.shift()(response()); await done;
  assert.deepEqual(s.states, ['loading', 'switching', 'hd']);
  assert.ok(s.videos.every(video => video.src.startsWith('blob:') && !video.paused));
  assert.ok(s.covers.every(cover => cover.removed));
});

test('the switch captures the latest playback state after downloading, not the initial position', async () => {
  let finish;
  const s = setup({ pair: false, fetcher: () => new Promise(resolve => { finish = resolve; }) });
  const video = s.videos[0], done = s.transaction.run();
  video._time = 13.2; video.paused = true; video.muted = false;
  video.volume = .25; video.playbackRate = 1.5; video.loop = false;
  finish(response()); await done;
  assert.equal(video.currentTime, 13.2);
  assert.equal(video.paused, true);
  assert.equal(video.muted, false);
  assert.equal(video.volume, .25);
  assert.equal(video.playbackRate, 1.5);
  assert.equal(video.loop, false);
});

test('comparison members seek together, and explicit controls can update the intended state during the switch', async () => {
  let s;
  s = setup({ onState(state) {
    if (state !== 'switching') return;
    assert.equal(s.transaction.state, 'switching');
    assert.ok(s.videos.every(video => video.src.startsWith('low-')), 'switch-start precedes source mutation');
    s.transaction.setIntent(s.videos[1], { time: 11, paused: true });
    s.transaction.setIntent(s.videos[1], { muted: false, volume: .4, playbackRate: 1.25 });
  } });
  await s.transaction.run();
  assert.ok(s.videos.every(video => video.currentTime === 11 && video.paused));
  assert.equal(s.videos[0].muted, true);
  assert.equal(s.videos[1].muted, false);
  assert.equal(s.videos[1].volume, .4);
  assert.equal(s.transaction.getIntent(s.videos[1]).playbackRate, 1.25);
  assert.equal(s.transaction.setIntent(s.videos[0], { paused: false }), false, 'normal controls own playback outside a switch');
});

test('an abandoned download cannot replace a different project even if fetch resolves later', async () => {
  let finish, current = true;
  const s = setup({ pair: false, canCommit: () => current, fetcher: () => new Promise(resolve => { finish = resolve; }) });
  const done = s.transaction.run(); current = false; s.transaction.abort(); finish(response());
  await assert.rejects(done, { name: 'AbortError' });
  assert.equal(s.videos[0].src, 'low.mp4');
  assert.equal(s.videos[0].paused, false);
  assert.ok(!s.states.includes('switching'));
});

test('one failed HD download leaves both preview pictures running and releases the successful member', async () => {
  let calls = 0;
  const s = setup({ fetcher: async () => ++calls === 1 ? response() : { ok: false } });
  await assert.rejects(s.transaction.run(), /download failed/);
  assert.ok(s.videos.every(video => video.src.startsWith('low-') && !video.paused));
  assert.deepEqual(s.revoked, ['blob:hd-0']);
  assert.ok(!s.states.includes('switching'));
});

test('HD is decode-validated offscreen before any visible preview is touched', async () => {
  const s = setup({ createDecoder: () => new Media('', { failHD: true }) });
  await assert.rejects(s.transaction.run(), /decode/);
  assert.ok(s.videos.every(video => video.loads.length === 0 && !video.paused));
  assert.equal(s.revoked.length, 2);
});

test('if a visible HD decoder fails, both original sources and the intended paused position are restored', async () => {
  const videos = [new Media('low-before.mp4'), new Media('low-after.mp4', { failHD: true })];
  let s;
  s = setup({ videos, onState(state) { if (state === 'switching') s.transaction.setIntent(videos[1], { paused: true, time: 10.5 }); } });
  await assert.rejects(s.transaction.run(), /decode/);
  assert.deepEqual(videos.map(video => video.src), ['low-before.mp4', 'low-after.mp4']);
  assert.ok(videos.every(video => video.paused && video.currentTime === 10.5));
  assert.deepEqual(s.states, ['loading', 'switching', 'restoring', 'preview']);
  assert.ok(s.covers.every(cover => cover.removed));
  assert.equal(s.revoked.length, 2);
});

test('file and group memory limits fail safely without changing the preview', async () => {
  const s = setup({ groupLimit: 15 });
  await assert.rejects(s.transaction.run(), /group exceeds/);
  assert.ok(s.videos.every(video => video.src.startsWith('low-')));
  const controller = new AbortController();
  await assert.rejects(fetchBlob('large.mp4', { fetcher: async () => response(20), signal: controller.signal, limit: 15 }), /memory budget/);
});

test('dispose revokes successful HD object URLs when the page is leaving', async () => {
  const s = setup({ pair: false });
  await s.transaction.run();
  assert.equal(s.revoked.length, 0, 'keep an object URL valid while its video can seek');
  s.transaction.dispose();
  assert.deepEqual(s.revoked, ['blob:hd-0']);
});

test('a controller that handles switch-end owns playback without a second engine play attempt', async () => {
  let s, playCalls = 0;
  s = setup({ pair: false, onState(state) {
    if (state !== 'hd') return;
    s.videos[0].play();
    return { handled: true };
  } });
  const normalPlay = s.videos[0].play;
  s.videos[0].play = function () { playCalls++; return normalPlay.call(this); };
  await s.transaction.run();
  assert.equal(playCalls, 1);
});

test('a streamed response is canceled as soon as its actual bytes exceed the limit', async () => {
  let canceled = false, released = false;
  const reader = {
    async read() { return { done: false, value: new Uint8Array(20) }; },
    async cancel() { canceled = true; }, releaseLock() { released = true; }
  };
  const res = { ok: true, type: 'basic', headers: { get: () => null }, body: { getReader: () => reader } };
  await assert.rejects(fetchBlob('stream.mp4', { fetcher: async () => res, signal: new AbortController().signal, limit: 15 }), /memory budget/);
  assert.equal(canceled, true);
  assert.equal(released, true);
});

function streamedResponse(chunks, { length = chunks.reduce((sum, size) => sum + size, 0), encoding = null } = {}) {
  let index = 0;
  return { ok: true, type: 'basic',
    headers: { get: name => ({ 'content-length': length === null ? null : String(length), 'content-encoding': encoding, 'content-type': 'video/mp4' })[name] ?? null },
    body: { getReader: () => ({
      async read() { return index < chunks.length ? { done: false, value: new Uint8Array(chunks[index++]) } : { done: true }; },
      async cancel() {}, releaseLock() {}
    }) }
  };
}

test('stream progress counts decoded bytes and never invents an unknown or compressed total', async () => {
  for (const options of [{ length: 10 }, { length: null }, { length: 4, encoding: 'gzip' }]) {
    const progress = [];
    const blob = await fetchBlob('stream.mp4', {
      fetcher: async () => streamedResponse([3, 7], options), signal: new AbortController().signal,
      onProgress: value => progress.push(value)
    });
    assert.equal(blob.size, 10);
    assert.deepEqual(progress.map(value => value.loaded), [0, 3, 10, 10]);
    assert.deepEqual(progress.map(value => value.total), options.length === 10 ? [10, 10, 10, 10] : [null, null, null, 10]);
  }
});

test('a comparison reports cumulative bytes and a whole-group percentage only once all totals are known', async () => {
  const progress = [];
  let calls = 0;
  const s = setup({
    fetcher: async () => ++calls === 1 ? streamedResponse([4, 6]) : streamedResponse([5, 25]),
    onProgress: value => progress.push(value)
  });
  await s.transaction.run();
  assert.deepEqual(progress.slice(0, 4).map(value => value.percent), [null, null, null, null], 'the first file cannot stand in for the unknown second file');
  assert.deepEqual(progress[4], { loaded: 10, total: 40, percent: 25 });
  assert.deepEqual(progress[5], { loaded: 15, total: 40, percent: 37 });
  assert.deepEqual(progress.at(-1), { loaded: 40, total: 40, percent: 100 });
  assert.ok(progress.every((value, index) => !index || value.loaded >= progress[index - 1].loaded));
});

function slowTransfer() {
  let now = 0, id = 0, pending;
  const timers = new Map();
  const fetcher = async (_, { signal }) => {
    signal.addEventListener('abort', () => pending?.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    return { ok: true, type: 'basic', headers: { get: () => null }, body: { getReader: () => ({
      read() { return new Promise((resolve, reject) => { pending = { resolve, reject }; }); },
      async cancel() {}, releaseLock() {}
    }) } };
  };
  const s = setup({ pair: false, fetcher,
    setTimer(fn, ms) { const key = ++id; timers.set(key, { fn, at: now + ms }); return key; },
    clearTimer(key) { timers.delete(key); }
  });
  return { ...s, timers,
    async tick(ms) { now += ms; for (const [key, value] of [...timers]) if (value.at <= now) { timers.delete(key); value.fn(); } await flush(); },
    async chunk(size) { pending.resolve({ done: false, value: new Uint8Array(size) }); await flush(); },
    async finish() { pending.resolve({ done: true }); await flush(); }
  };
}

test('a continuously progressing slow HD file can exceed two minutes without losing the preview', async () => {
  const s = slowTransfer(), done = s.transaction.run();
  await flush();
  for (let i = 0; i < 4; i++) { await s.tick(40000); await s.chunk(10); }
  assert.equal(s.transaction.state, 'loading');
  assert.equal(s.videos[0].src, 'low.mp4');
  await s.finish(); await done;
  assert.equal(s.transaction.state, 'hd');
  assert.equal(s.timers.size, 0);
});

test('a stalled download fails after 45 seconds and a continuous transfer remains bounded at ten minutes', async () => {
  for (const continuous of [false, true]) {
    const s = slowTransfer();
    const result = s.transaction.run().then(() => null, error => error);
    await flush();
    if (continuous) {
      for (let i = 0; i < 14; i++) { await s.tick(40000); await s.chunk(1); }
      await s.tick(40000);
    } else await s.tick(45000);
    assert.equal((await result).name, 'TimeoutError');
    assert.equal(s.videos[0].src, 'low.mp4');
    assert.equal(s.transaction.state, 'preview');
    assert.equal(s.timers.size, 0);
  }
});

test('native controls can change seek, pause, volume and speed during visible source decoding', async () => {
  const video = new Media('low.mp4');
  const normalLoad = video.load;
  video.load = function () {
    normalLoad.call(this);
    if (!this.src.startsWith('blob:')) return;
    queueMicrotask(() => {
      this.currentTime = 12.5;
      this.muted = false; this.volume = .2; this.dispatchEvent(new Event('volumechange'));
      this.playbackRate = 1.75; this.dispatchEvent(new Event('ratechange'));
      this.play(); this.pause();
    });
  };
  const s = setup({ videos: [video] });
  await s.transaction.run();
  assert.equal(video.currentTime, 12.5);
  assert.equal(video.paused, true);
  assert.equal(video.muted, false);
  assert.equal(video.volume, .2);
  assert.equal(video.playbackRate, 1.75);
});

test('a controller start-pause is internal and does not replace a playing intent', async () => {
  let s;
  s = setup({ onState(state) { if (state === 'switching') s.videos.forEach(video => video.pause()); } });
  await s.transaction.run();
  assert.ok(s.videos.every(video => !video.paused));
});

test('a native seeking controller can forward the same intent without recursive seeks', async () => {
  const s = setup({ pair: false });
  let forwarded = 0;
  s.videos[0].addEventListener('seeking', () => {
    if (s.transaction.state !== 'switching') return;
    forwarded++;
    s.transaction.setIntent(s.videos[0], { time: s.videos[0].currentTime });
  });
  await s.transaction.run();
  assert.equal(forwarded, 1);
  assert.equal(s.videos[0].currentTime, 7.9);
});

function runtime({ readiness = [[3], [3]], fetcher, readyState = 'complete', idle = false } = {}) {
  let now = 0, timerId = 0, urlId = 0, observer;
  const timers = new Map(), calls = [], idleCallbacks = new Map();
  const classes = new Set();
  const classList = { contains: name => classes.has(name) };
  const makeRoot = () => Object.assign(new EventTarget(), {
    dataset: {}, isConnected: true, closest: () => null
  });
  const roots = readiness.map(makeRoot);
  const members = roots.map((root, i) => readiness[i].map((readyState, j) => Object.assign(new Media(`low-${i}-${j}.mp4`), {
    readyState, dataset: { srcHd: `hd-${i}-${j}.mp4` },
    closest: selector => selector === '[data-progressive-group]' ? root : null,
    getBoundingClientRect: () => ({ width: 640, height: 360, top: 100, bottom: 460 })
  })));
  const videos = members.flat();
  const document = Object.assign(new EventTarget(), {
    querySelectorAll: () => videos, baseURI: 'https://example.test/', hidden: false, readyState,
    body: { classList }, createElement: () => new Media()
  });
  const win = Object.assign(new EventTarget(), {
    document, navigator: {}, innerHeight: 900, AbortController, Blob,
    URL: { createObjectURL: () => `blob:hd-${++urlId}`, revokeObjectURL() {} },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    CustomEvent: class extends Event { constructor(name, opts) { super(name, opts); this.detail = opts.detail; } },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    fetch(url, { signal }) {
      const call = { url, aborted: false }; calls.push(call);
      if (fetcher) return fetcher(url, { signal });
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => {
        call.aborted = true; reject(Object.assign(new Error('canceled'), { name: 'AbortError' }));
      }, { once: true }));
    }
  });
  if (idle) {
    win.requestIdleCallback = fn => { const id = ++timerId; idleCallbacks.set(id, fn); return id; };
    win.cancelIdleCallback = id => idleCallbacks.delete(id);
  }
  const tick = async ms => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
    await flush();
  };
  const originalNow = Date.now;
  Date.now = () => now;
  const api = install(win);
  return { api, calls, videos, members, roots, win, tick, classes, idleCallbacks,
    idle() { const callbacks = [...idleCallbacks.values()]; idleCallbacks.clear(); callbacks.forEach(fn => fn({ timeRemaining: () => 50 })); },
    visible: (index, value = true) => observer([{ target: roots[index], isIntersecting: value }]),
    fail(index, reason = 'timeout') { document.dispatchEvent(new win.CustomEvent('video-loader:preview-failed', { detail: { videos: members[index], reason } })); },
    async close() { win.dispatchEvent(new Event('pagehide')); await flush(); Date.now = originalNow; }
  };
}

test('the runtime queues one visible group, cancels a departed group, and waits for a returning preview frame', async () => {
  const s = runtime();
  const { api, calls, videos, tick } = s;
  try {
    s.visible(0); s.visible(1);
    await tick(0); await tick(1210);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /hd-0/);
    s.visible(0, false);
    await tick(0); await tick(50);
    assert.equal(calls[0].aborted, true);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /hd-1/);
    videos[0].readyState = 0;
    s.visible(0); s.visible(1, false);
    await tick(0); await tick(50);
    assert.equal(calls[1].aborted, true);
    assert.equal(calls.length, 2, 'the old readyAt cannot bypass a new preview decode');
    videos[0].readyState = 3; videos[0].dispatchEvent(new Event('loadeddata'));
    await tick(0);
    assert.equal(calls.length, 3);
    assert.equal(calls.filter(call => !call.aborted).length, 1);
    await s.close();
    assert.ok(calls.every(call => call.aborted));
    assert.equal(api.status[0].quality, 'preview');
  } finally { await s.close(); }
});

test('only an explicit preview failure lets a current undecoded pair recover atomically from HD', async () => {
  const s = runtime({ readiness: [[0, 4]], readyState: 'interactive', fetcher: async () => response() });
  let recovering = false;
  s.roots[0].addEventListener('progressive-video:switch-start', event => {
    recovering = event.detail.recovery;
    assert.ok(s.members[0].every(video => s.api.isSwitching(video)));
    s.api.setIntent(s.members[0][1], { paused: false, time: 1 });
  });
  try {
    s.visible(0); await s.tick(0); await s.tick(20000);
    assert.equal(s.calls.length, 0, 'ordinary slow previews retain priority over HD');
    s.fail(0); await s.tick(200); await flush();
    assert.equal(recovering, true);
    assert.equal(s.calls.length, 2);
    assert.equal(s.api.status[0].quality, 'hd');
    assert.ok(s.members[0].every(video => video.src.startsWith('blob:') && video.currentTime === 1 && !video.paused));
  } finally { await s.close(); }
});

test('preview-failed signals cannot load HD for hidden, offline or never-loaded media', async () => {
  const s = runtime({ readiness: [[0, 0]] });
  try {
    s.fail(0); s.visible(0); await s.tick(20000);
    assert.equal(s.calls.length, 0, 'offscreen failures are not latched');
    s.win.navigator.onLine = false; s.fail(0); await s.tick(200);
    assert.equal(s.calls.length, 0);
    s.win.navigator.onLine = true;
    s.members[0].forEach(video => { video.src = ''; });
    s.fail(0); await s.tick(200);
    assert.equal(s.calls.length, 0, 'stale currentSrc cannot authorize upgrading a detached source');
  } finally { await s.close(); }
});

test('leaving during HD rescue aborts the pending request and never changes the preview source', async () => {
  const s = runtime({ readiness: [[0, 4]] });
  try {
    s.visible(0); await s.tick(0); s.fail(0); await s.tick(200);
    assert.equal(s.calls.length, 1);
    s.visible(0, false); await s.tick(0); await s.tick(50);
    assert.equal(s.calls[0].aborted, true);
    assert.equal(s.api.status[0].quality, 'preview');
    assert.ok(s.members[0].every(video => video.src.startsWith('low-')));
  } finally { await s.close(); }
});

test('an unsuccessful HD rescue remains bounded rather than repeatedly downloading the same files', async () => {
  const s = runtime({ readiness: [[0, 4]], fetcher: async () => ({ ok: false }) });
  try {
    s.visible(0); await s.tick(0); s.fail(0); await s.tick(200); await s.tick(50); await s.tick(50000);
    assert.equal(s.calls.length, 2);
    assert.equal(s.api.status[0].attempts, 2);
    assert.equal(s.api.status[0].quality, 'preview');
    assert.ok(s.members[0].every(video => video.src.startsWith('low-')));
  } finally { await s.close(); }
});

test('ordinary HD waits for window load, the opening UI and other active preview startup', async () => {
  const s = runtime({ readiness: [[3], [0]], readyState: 'interactive' });
  try {
    s.visible(0); s.visible(1);
    await s.tick(0); await s.tick(10000);
    assert.equal(s.calls.length, 0);
    assert.equal(s.api.getStatus(s.roots[0]).state, 'waiting');
    s.win.document.readyState = 'complete'; s.win.dispatchEvent(new Event('load')); await s.tick(0);
    assert.equal(s.calls.length, 0, 'a second visible preview still has priority');
    s.members[1][0].readyState = 3; s.members[1][0].dispatchEvent(new Event('loadeddata'));
    s.classes.add('is-v3-loading'); await s.tick(0);
    assert.equal(s.calls.length, 0, 'the opening UI also holds off HD');
    s.classes.delete('is-v3-loading');
    s.members[0][0].dataset.videoLoaderManaged = 'true';
    s.members[0][0].dataset.videoLoaderReady = 'false';
    s.api.refresh(); await s.tick(0);
    assert.equal(s.calls.length, 0, 'a managed preview must finish its own startup UI');
    s.members[0][0].dataset.videoLoaderReady = 'true';
    s.api.refresh(); await s.tick(0);
    assert.equal(s.calls.length, 1);
  } finally { await s.close(); }
});

test('idle scheduling rechecks visibility and resource readiness before starting HD', async () => {
  const s = runtime({ readiness: [[3]], idle: true });
  try {
    s.visible(0); await s.tick(0); await s.tick(1210);
    assert.equal(s.calls.length, 0);
    assert.equal(s.idleCallbacks.size, 1);
    s.visible(0, false); await s.tick(0); s.idle();
    assert.equal(s.calls.length, 0);
    s.visible(0); await s.tick(0);
    s.win.document.readyState = 'loading'; s.idle(); await s.tick(0);
    assert.equal(s.calls.length, 0, 'a queued idle callback cannot bypass newer resource constraints');
    s.win.document.readyState = 'complete'; s.win.dispatchEvent(new Event('load')); await s.tick(0);
    s.idle(); await flush();
    assert.equal(s.calls.length, 1);
  } finally { await s.close(); }
});

test('state events expose real group progress and late subscribers can read the same completed status', async () => {
  let fetched = 0;
  const s = runtime({ readiness: [[3, 3]], fetcher: async () => ++fetched === 1 ? streamedResponse([4, 6]) : streamedResponse([5, 25]) });
  const reports = [];
  s.roots[0].addEventListener('progressive-video:state', event => {
    assert.equal(event.target, s.roots[0]); assert.equal(event.bubbles, true);
    reports.push(event.detail);
  });
  try {
    s.visible(0); await s.tick(0); await s.tick(1210);
    assert.ok(reports.some(item => item.state === 'waiting'));
    assert.ok(reports.some(item => item.state === 'loading' && item.loaded === 4 && item.percent === null));
    assert.ok(reports.some(item => item.state === 'loading' && item.loaded === 15 && item.total === 40 && item.percent === 37));
    assert.ok(reports.some(item => item.state === 'switching'));
    const final = s.api.getStatus(s.roots[0]);
    assert.equal(final.state, 'hd'); assert.equal(final.quality, 'hd');
    assert.equal(final.percent, 100); assert.equal(final.loaded, 40); assert.equal(final.total, 40);
    assert.equal(final.retryable, false);
    assert.deepEqual(final.videos, s.members[0]);
    assert.deepEqual(s.api.getStatus(s.members[0][0]), final);
    assert.deepEqual(reports.at(-1), final);
    assert.equal(s.api.getStatus({}), null);
    assert.equal(s.api.retry(s.roots[0]), false);
  } finally { await s.close(); }
});

test('manual retry resets bounded failures but remains queued until normal resource gates pass', async () => {
  let success = false;
  const s = runtime({ readiness: [[3]], fetcher: async () => success ? response() : { ok: false } });
  try {
    s.visible(0); await s.tick(0); await s.tick(1210); await s.tick(50); await s.tick(5000);
    assert.equal(s.calls.length, 2);
    assert.equal(s.api.getStatus(s.roots[0]).state, 'error');
    assert.equal(s.api.getStatus(s.roots[0]).retryable, true);
    assert.equal(s.api.retry({}), false);
    s.visible(0, false); assert.equal(s.api.retry(s.roots[0]), false);
    s.visible(0); s.win.navigator.onLine = false; assert.equal(s.api.retry(s.roots[0]), false);
    s.win.navigator.onLine = true; s.win.document.readyState = 'interactive'; success = true;
    assert.equal(s.api.retry(s.members[0][0]), true);
    assert.equal(s.api.getStatus(s.roots[0]).state, 'waiting');
    assert.equal(s.api.retry(s.roots[0]), false, 'a second click cannot queue another transfer');
    await s.tick(10000);
    assert.equal(s.calls.length, 2, 'manual retry still respects page-resource readiness');
    s.win.document.readyState = 'complete'; s.win.dispatchEvent(new Event('load')); await s.tick(0);
    assert.equal(s.calls.length, 3);
    assert.equal(s.api.getStatus(s.roots[0]).quality, 'hd');
    assert.equal(s.api.status[0].attempts, 1);
  } finally { await s.close(); }
});

test('departed downloads publish a preview state without a retryable error', async () => {
  const s = runtime({ readiness: [[3]] });
  const reports = [];
  s.roots[0].addEventListener('progressive-video:state', event => reports.push(event.detail));
  try {
    s.visible(0); await s.tick(0); await s.tick(1210);
    assert.equal(s.api.getStatus(s.roots[0]).state, 'loading');
    assert.equal(s.api.retry(s.roots[0]), false);
    s.visible(0, false); await s.tick(0);
    assert.equal(s.api.getStatus(s.roots[0]).state, 'preview');
    assert.equal(s.api.getStatus(s.roots[0]).retryable, false);
    assert.equal(reports.some(item => item.state === 'error'), false);
  } finally { await s.close(); }
});

test('an HD transfer yields the connection if another visible preview begins loading', async () => {
  const s = runtime({ readiness: [[3], [0]] });
  try {
    s.visible(0); await s.tick(0); await s.tick(1210);
    assert.equal(s.calls.length, 1);
    s.visible(1); await s.tick(0); await s.tick(50);
    assert.equal(s.calls[0].aborted, true);
    assert.equal(s.calls.length, 1);
    assert.notEqual(s.api.getStatus(s.roots[0]).state, 'error');
    s.members[1][0].readyState = 3; s.members[1][0].dispatchEvent(new Event('loadeddata')); await s.tick(0);
    assert.equal(s.calls.length, 2);
  } finally { await s.close(); }
});
