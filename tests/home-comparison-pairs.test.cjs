const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/banner-v3.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const progressiveFixture = require('./progressive-controller-fixture.cjs');

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
    dispatchEvent(event) { this.fire(event.type, event); },
    setPointerCapture() {}, hasPointerCapture() { return false; }
  }, extra);
}

function setup({ mobile = false, reduced = false, loading = false, managed = false, controls = false, visualWidth = null, language = 'en', startTime = '0' } = {}) {
  const observers = [], frames = new Map();
  let frameId = 0, timerId = 0;
  const timers = new Map();
  const deck = element(), body = element(), motion = element({ matches: reduced });
  if (loading) body.classList.add('is-v3-loading');
  const pairs = [0, 1].map(index => {
    const card = element();
    if (index === 0) card.classList.add('is-active');
    const frame = element({ getBoundingClientRect: () => ({ left: 0, width: 1000 }) });
    const visual = visualWidth === null ? null : element({ getBoundingClientRect: () => ({ left: 100, width: visualWidth }) });
    const handle = element(), copy = element({ inert: false });
    const playerControls = index === 0 && controls ? {
      root: element({ hidden: true }), toggle: element(), seek: element({ value: 0, disabled: true }), clock: element(), sound: element()
    } : null;
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
      dataset: index === 0 ? { startTime, beforeLabel: '原始画面', afterLabel: '增强细节', ...(controls ? { controlsDelay: '3000' } : {}) } : {},
      closest: selector => selector === '.deck-card' ? card : deck,
      querySelector: selector => ({ '.comparison-frame': frame, '.comparison-visual': visual, '.comparison-handle': handle, '.comparison-copy': copy, '.comparison-video--before': videos[0], '.comparison-video--after': videos[1],
        '[data-comparison-controls]': playerControls?.root, '[data-comparison-play]': playerControls?.toggle, '[data-comparison-seek]': playerControls?.seek,
        '[data-comparison-time]': playerControls?.clock, '[data-comparison-sound]': playerControls?.sound })[selector]
    });
    stage.style.setProperty = (name, value) => { stage.properties[name] = value; };
    return { stage, card, frame, handle, copy, videos, controls: playerControls };
  });
  const document = element({ body, documentElement: { lang: language }, hidden: false, querySelectorAll: () => pairs.map(pair => pair.stage) });
  const window = element({ matchMedia: query => query.includes('reduced-motion') ? motion : { matches: mobile }, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  const upgrade = progressiveFixture(window, pairs[0].stage, pairs[0].videos);
  vm.runInNewContext(source, { document, window, CustomEvent: class { constructor(type) { this.type = type; } }, MutationObserver: class { constructor(fn) { this.fn = fn; } observe(target) { observers.push({ target, fn: this.fn }); } } });
  const notify = target => observers.filter(observer => observer.target === target).forEach(observer => observer.fn());
  return { pairs, document, window, deck, body, frames, upgrade,
    runTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
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

test('comparison controls pause both pictures, preserve manual pause through buffering, and expose only one audio track', async () => {
  const app = setup({ controls: true, mobile: true, language: 'zh-Hans' }); await flush();
  const pair = app.pairs[0], controls = pair.controls;
  assert.equal(controls.root.hidden, false);
  assert.equal(controls.root.attrs['data-visible'], 'false', 'controls wait for uninterrupted dwell on this project');
  app.runTimers();
  assert.equal(controls.root.attrs['data-visible'], 'true');
  assert.equal(controls.seek.disabled, false);
  assert.equal(controls.toggle.textContent, '暂停');
  assert.equal(controls.clock.textContent, '0:00 / 0:20');
  controls.toggle.fire('click');
  assert.ok(pair.videos.every(video => video.paused));
  pair.videos.forEach(video => { video.readyState = 3; video.fire('canplay'); });
  assert.ok(pair.videos.every(video => video.paused), 'buffer recovery must respect explicit pause');
  assert.equal(controls.toggle.textContent, '播放');
  controls.toggle.fire('click'); await flush();
  assert.ok(pair.videos.every(video => !video.paused));
  controls.sound.fire('click');
  assert.equal(pair.videos[0].muted, true);
  assert.equal(pair.videos[1].muted, false);
  assert.equal(controls.sound.textContent, '声音开启');
  app.select(1); await flush();
  assert.equal(controls.root.attrs['data-visible'], 'false');
  app.select(0); await flush();
  assert.ok(pair.videos.every(video => video.muted), 'returning to a project starts quietly');
  assert.ok(app.pairs[1].videos.every(video => video.loads === 1), 'only an explicitly visited second project loads');
});

test('comparison seeking moves both pictures and resumes only after both decoders are ready', async () => {
  const app = setup({ controls: true }); await flush();
  const pair = app.pairs[0], controls = pair.controls;
  pair.videos.forEach(video => { video.readyState = 3; });
  controls.seek.fire('pointerdown', { pointerId: 6 });
  controls.seek.fire('pointercancel'); await flush();
  assert.ok(pair.videos.every(video => !video.paused), 'canceling an unchanged seek restores playback');
  controls.seek.fire('pointerdown', { pointerId: 7 });
  controls.seek.value = 60;
  controls.seek.fire('input');
  assert.ok(pair.videos.every(video => video.paused && video.currentTime === 12));
  assert.equal(controls.clock.textContent, '0:12 / 0:20');
  pair.videos[0].readyState = 2;
  controls.seek.fire('pointerup'); await flush();
  assert.ok(pair.videos.every(video => video.paused), 'one buffering decoder holds the comparison');
  pair.videos[0].readyState = 3; pair.videos[0].fire('canplay'); await flush();
  assert.ok(pair.videos.every(video => !video.paused));
  controls.toggle.fire('click');
  controls.seek.value = 90; controls.seek.fire('input');
  pair.videos.forEach(video => video.fire('seeked')); await flush();
  assert.ok(pair.videos.every(video => video.paused && video.currentTime === 18), 'seeking while manually paused stays paused');
  assert.ok(app.pairs[1].videos.every(video => video.loads === 0), 'scrubbing never loads another project');
});

test('comparison controls keep keyboard and pointer events inside the player and cancel dwell on leaving', async () => {
  const app = setup({ controls: true }); await flush();
  const controls = app.pairs[0].controls;
  for (const type of ['pointerdown', 'pointermove', 'click', 'keydown', 'wheel']) {
    let stopped = false;
    controls.root.fire(type, { stopPropagation() { stopped = true; } });
    assert.ok(stopped, type);
  }
  app.select(1); await flush();
  app.runTimers();
  assert.equal(controls.root.attrs['data-visible'], 'false', 'a stale timer cannot reveal controls for a departed card');
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

test('pointer reveal uses the mobile picture width and falls back for a display-contents desktop wrapper', async () => {
  for (const [visualWidth, expected] of [[0, '75%'], [800, '81.25%']]) {
    const app = setup({ visualWidth }); await flush();
    app.pairs[0].frame.fire('pointerdown', {
      isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 1, clientX: 750,
      target: { closest: () => null }, preventDefault() {}, stopPropagation() {}
    });
    assert.equal(app.pairs[0].stage.properties['--compare-split'], expected);
  }
});

const dragEvent = (extra = {}) => ({
  isPrimary: true, pointerType: 'mouse', button: 0, pointerId: 7, clientX: 750,
  target: { closest: () => null }, preventDefault() {}, stopPropagation() {}, ...extra
});

test('both comparison copies hide only during pointer dragging and recover on release', async () => {
  const app = setup(); await flush();
  for (const [index, pair] of app.pairs.entries()) {
    app.select(index); await flush();
    pair.frame.fire('pointerdown', dragEvent());
    assert.ok(pair.stage.classList.contains('is-interacting'));
    assert.equal(pair.copy.inert, true, 'a hidden title cannot receive keyboard or pointer activation');
    pair.frame.fire('pointerup', dragEvent({ pointerId: 99 }));
    assert.ok(pair.stage.classList.contains('is-interacting'), 'another pointer cannot finish the drag');
    pair.frame.fire('pointerup', dragEvent());
    assert.equal(pair.stage.classList.contains('is-interacting'), false);
    assert.equal(pair.copy.inert, false, 'release begins restoring the whole copy without a second timer');
    app.key(index, 'ArrowLeft');
    assert.equal(pair.stage.classList.contains('is-interacting'), false, 'keyboard comparison keeps the copy readable');
  }
});

test('canceled or interrupted comparison drags never leave their titles hidden', async () => {
  for (const interrupt of ['pointercancel', 'lostpointercapture', 'blur', 'pagehide', 'hidden', 'strip', 'project', 'opening']) {
    const app = setup(); await flush();
    const pair = app.pairs[0];
    let captured = false, releases = 0;
    pair.frame.setPointerCapture = () => { captured = true; };
    pair.frame.hasPointerCapture = () => captured;
    pair.frame.releasePointerCapture = id => {
      captured = false; releases++;
      pair.frame.fire('lostpointercapture', { pointerId: id });
    };
    pair.frame.fire('pointerdown', dragEvent());
    if (interrupt === 'hidden') { app.document.hidden = true; app.document.fire('visibilitychange'); }
    else if (interrupt === 'strip') app.strip(true);
    else if (interrupt === 'project') app.select(1);
    else if (interrupt === 'opening') app.opening(true);
    else if (interrupt === 'blur' || interrupt === 'pagehide') app.window.fire(interrupt);
    else pair.frame.fire(interrupt, dragEvent());
    assert.equal(pair.stage.classList.contains('is-interacting'), false, interrupt);
    assert.equal(pair.copy.inert, false, interrupt);
    assert.equal(releases, 1, `${interrupt}: releasing capture must not reenter cleanup`);
    pair.frame.fire('pointermove', dragEvent({ clientX: 200 }));
    assert.equal(pair.stage.properties['--compare-split'], '75%', `${interrupt}: stale moves are ignored`);
  }
});

test('title links and touch scrolling do not hide copy; static reduced-motion comparisons remain draggable', async () => {
  const app = setup({ reduced: true }); await flush();
  const pair = app.pairs[0];
  pair.frame.fire('pointerdown', dragEvent({ target: { closest: selector => selector.startsWith('a,') ? {} : null } }));
  pair.frame.fire('pointerdown', dragEvent({ pointerType: 'touch' }));
  assert.equal(pair.stage.classList.contains('is-interacting'), false);
  pair.frame.fire('pointerdown', dragEvent({ pointerType: 'touch', target: { closest: selector => selector === '.comparison-handle' ? {} : null } }));
  assert.ok(pair.stage.classList.contains('is-interacting'));
  assert.equal(pair.stage.properties['--compare-split'], '75%');
  pair.frame.fire('pointerup', dragEvent());
  assert.equal(pair.copy.inert, false);
  assert.ok(pair.videos.every(video => video.loads === 0), 'static reveal does not force video loading');
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
  before.src = 'before.mp4'; after.src = 'after.mp4';
  before.metadata(); await flush();
  assert.ok(before.paused && after.paused, 'neither side starts before both are ready');
  after.metadata(); await flush();
  assert.equal(before.src, 'before.mp4'); assert.equal(after.src, 'after.mp4');
  assert.equal(before.loads + after.loads, 0);
  assert.ok(before.paused && after.paused, 'metadata alone must not start progressive streams');
  before.dataset.videoLoaderReady = 'true'; after.dataset.videoLoaderReady = 'true';
  before.fire('video-loader:ready'); await flush();
  assert.ok(!before.paused && !after.paused);
  app.pairs[1].videos.forEach(video => video.fire('video-loader:ready'));
  await flush();
  assert.ok(app.pairs[1].videos.every(video => video.paused && video.loads === 0));
});


test('either buffering side pauses both and resumes only when both have future frames', async () => {
  const app = setup(); await flush();
  const [before, after] = app.pairs[0].videos;
  before.readyState = after.readyState = 3;
  before.readyState = 2; before.fire('waiting');
  assert.ok(before.paused && after.paused);
  assert.equal(app.frames.size, 0);
  after.fire('canplay');
  assert.ok(before.paused && after.paused, 'one ready side must not run ahead');
  before.readyState = 3; before.fire('canplay'); await flush();
  assert.ok(!before.paused && !after.paused);
  after.readyState = 2; after.fire('waiting');
  assert.ok(before.paused && after.paused, 'the enhanced side is also allowed to stop the pair');
  after.readyState = 3; after.fire('canplay'); await flush();
  assert.ok(!before.paused && !after.paused);
});

test('network stalls with buffered frames do not freeze playback, real stalls respect inactive and reduced-motion state', async () => {
  const app = setup(); await flush();
  const [before, after] = app.pairs[0].videos;
  before.readyState = after.readyState = 3;
  before.fire('stalled');
  assert.ok(!before.paused && !after.paused, 'a delayed range request can coexist with enough decoded frames');
  before.readyState = 1; before.fire('stalled');
  assert.ok(before.paused && after.paused);
  app.select(1);
  before.readyState = 3; before.fire('canplay'); await flush();
  assert.ok(before.paused && after.paused, 'a background readiness event must not resume the old project');
  app.select(0); await flush();
  assert.ok(!before.paused && !after.paused);
  before.readyState = 2; before.fire('waiting');
  app.reduced(true);
  before.readyState = 3; before.fire('canplay');
  assert.ok(before.paused && after.paused);
});

test('buffer recovery aligns a drifted pair once without re-seeking on every canplay', async () => {
  const app = setup(); await flush();
  const [before, after] = app.pairs[0].videos;
  before.readyState = after.readyState = 3;
  let childTime = before.currentTime, seeks = 0;
  Object.defineProperty(before, 'currentTime', {
    get() { return childTime; },
    set(value) { childTime = value; seeks++; before.seeking = true; before.readyState = 1; before.fire('seeking'); }
  });
  after.currentTime = .4;
  before.readyState = 2; before.fire('waiting');
  before.readyState = 3; before.fire('canplay');
  assert.equal(seeks, 1);
  assert.ok(before.paused && after.paused, 'the alignment seek must complete before restarting');
  before.seeking = false; before.readyState = 3; before.fire('seeked'); await flush();
  assert.ok(!before.paused && !after.paused);
  for (let i = 0; i < 3; i++) { before.fire('canplay'); after.fire('canplay'); after.fire('timeupdate'); }
  assert.equal(seeks, 1, 'readiness/play events must not seek an already aligned decoder again');
  assert.equal(childTime, .4);
});

test('autoplay rejection pauses both and requires a new explicit play gesture', async () => {
  const app = setup({ managed: true });
  const pair = app.pairs[0];
  let blocked = true, prompts = 0;
  pair.frame.addEventListener('video-loader:play-blocked', () => { prompts++; });
  const normalPlay = pair.videos[0].play;
  pair.videos[0].play = function () {
    if (blocked) return Promise.reject(Object.assign(new Error('gesture required'), { name: 'NotAllowedError' }));
    return normalPlay.call(this);
  };
  pair.videos.forEach(video => { video.metadata(); video.readyState = 3; video.dataset.videoLoaderReady = 'true'; });
  pair.videos[0].fire('video-loader:ready'); await flush();
  assert.ok(pair.videos.every(video => video.paused));
  assert.equal(prompts, 1);
  pair.videos.forEach(video => video.fire('canplay'));
  pair.videos[0].fire('video-loader:ready'); await flush();
  assert.equal(prompts, 1, 'readiness must not repeatedly retry a blocked autoplay policy');
  blocked = false;
  pair.videos[0].fire('video-loader:play'); await flush();
  assert.ok(pair.videos.every(video => !video.paused));
});

test('comparison controls and fallback reveal labels follow the page language', async () => {
  for (const [language, expected] of [
    ['en', { pause: 'Pause', pauseLabel: 'Pause comparison video', sound: 'Sound off', elapsed: '0:00 of 0:20', reveal: '52% 3D previs, 48% AI render' }],
    ['zh-Hans', { pause: '暂停', pauseLabel: '暂停对比视频', sound: '声音关闭', elapsed: '0:00，共 0:20', reveal: '52% 3D 运镜预演，48% AI 生成画面' }]
  ]) {
    const app = setup({ controls: true, language }); await flush();
    const controls = app.pairs[0].controls;
    assert.equal(controls.toggle.textContent, expected.pause);
    assert.equal(controls.toggle.attrs['aria-label'], expected.pauseLabel);
    assert.equal(controls.sound.textContent, expected.sound);
    assert.equal(controls.seek.attrs['aria-valuetext'], expected.elapsed);
    app.select(1); await flush();
    app.key(1, 'ArrowRight');
    assert.equal(app.pairs[1].handle.attrs['aria-valuetext'], expected.reveal);
  }
});

test('HD replacement holds the pair timeline and honors transport changes made during decode', async () => {
  const app = setup({ controls: true, language: 'zh-Hans' }); await flush();
  const pair = app.pairs[0], [before, after] = pair.videos, controls = pair.controls;
  before.currentTime = after.currentTime = 6.4; after.fire('timeupdate');
  app.upgrade.begin(); app.upgrade.reset(after);
  assert.equal(before.currentTime, 6.4, 'a resetting master must not seek its partner to zero');
  assert.equal(controls.clock.textContent, '0:06 / 0:20');
  assert.equal(app.frames.size, 0);
  app.upgrade.reset(before);
  controls.toggle.fire('click');
  controls.seek.value = 70; controls.seek.fire('input');
  controls.sound.fire('click');
  const detail = app.upgrade.finish(); await flush();
  assert.equal(detail.handled, true, 'only the pair controller resumes the restored media');
  assert.ok(pair.videos.every(video => video.paused && video.currentTime === 14 && video.loads === 1));
  assert.equal(before.muted, true); assert.equal(after.muted, false);
  assert.equal(controls.clock.textContent, '0:14 / 0:20');
  assert.equal(controls.toggle.textContent, '播放');
  controls.toggle.fire('click'); await flush();
  assert.ok(pair.videos.every(video => !video.paused));
});

test('finishing a quality switch offscreen cannot restart a departed comparison', async () => {
  const app = setup(); await flush();
  const pair = app.pairs[0];
  pair.videos.forEach(video => { video.currentTime = 8; });
  app.upgrade.begin(); app.select(1);
  app.upgrade.finish('error'); await flush();
  assert.ok(pair.videos.every(video => video.paused && video.currentTime === 8));
  app.select(0); await flush();
  assert.ok(pair.videos.every(video => !video.paused && video.loads === 1));
});

test('a never-decoded preview recovers with the intended opening frame and playback instead of its forced pause', async () => {
  const app = setup({ managed: true, startTime: '1' });
  const [before, after] = app.pairs[0].videos;
  before.src = 'stuck-before.mp4'; after.src = 'stuck-after.mp4';
  assert.ok(before.paused && after.paused);
  app.upgrade.begin({ recovery: true });
  assert.equal(app.upgrade.intent(after).paused, false, 'native loader pause is not a user pause');
  assert.equal(app.upgrade.intent(after).time, 1, 'recovery applies the opening frame that the preview never reached');
  before.dataset.videoLoaderReady = after.dataset.videoLoaderReady = 'true';
  app.upgrade.finish(); before.fire('video-loader:ready'); await flush();
  assert.ok(!before.paused && !after.paused);
  assert.equal(before.currentTime, 1); assert.equal(after.currentTime, 1);
  assert.equal(before.loads + after.loads, 0, 'recovery must not re-enter the preview source loader');
});

test('a manually paused comparison remains paused when a failed preview is rescued', async () => {
  const app = setup({ controls: true }); await flush();
  const pair = app.pairs[0]; pair.videos.forEach(video => { video.currentTime = 7; });
  pair.controls.toggle.fire('click');
  app.upgrade.begin({ recovery: true });
  assert.equal(app.upgrade.intent(pair.videos[1]).paused, true);
  app.upgrade.finish(); await flush();
  assert.ok(pair.videos.every(video => video.paused && video.currentTime === 7));
});
