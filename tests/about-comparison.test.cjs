const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/about-comparison.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const progressiveFixture = require('./progressive-controller-fixture.cjs');

function setup({ reduced = false, mobile = false, blocked = false, comparisons = [{}] } = {}) {
  const element = () => ({
    events: {}, attrs: {}, dataset: {}, style: { setProperty(name, value) { this[name] = value; } },
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); },
    fire(name, data = {}) { for (const fn of this.events[name] || []) fn(data); },
    dispatchEvent(event) { this.fire(event.type, event); },
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name] ?? null; }
  });
  const video = name => Object.assign(element(), {
    dataset: { src: `${name}.m4v`, srcMobile: `${name}-mobile.m4v` },
    paused: true, readyState: 0, currentTime: 0, duration: 9, seeking: false, loads: 0,
    load() { this.loads++; this.readyState = 0; },
    pause() { this.paused = true; },
    play() { if (blocked) return Promise.reject(new Error('blocked')); this.paused = false; return Promise.resolve(); }
  });
  const motion = Object.assign(element(), { matches: reduced });
  const window = Object.assign(element(), { matchMedia: query => query.includes('reduced') ? motion : { matches: mobile }, IntersectionObserver: true });
  const observers = new Map(), mutations = new Map();
  const groups = comparisons.map(({ dataset = {}, hidden, incomplete = false }, index) => {
    const before = video(index ? `previs-${index}` : 'previs'), after = video(index ? `ai-${index}` : 'ai');
    const handle = element(), toggle = element(), status = element(), stage = element();
    const capturedPointers = new Set();
    const frame = Object.assign(element(), {
      getBoundingClientRect: () => ({ left: 0, width: 1000 }),
      setPointerCapture(id) { capturedPointers.add(id); },
      hasPointerCapture(id) { return capturedPointers.has(id); },
      releasePointerCapture(id) { capturedPointers.delete(id); }
    });
    handle.closest = selector => selector === '.ab-compare__handle' ? handle : null;
    stage.dataset = dataset;
    const panel = hidden === undefined ? null : element();
    if (panel) panel.setAttribute('aria-hidden', String(hidden));
    stage.closest = () => panel;
    const elements = { '.ab-compare__before': before, '.ab-compare__after video': after, '.ab-compare__handle': handle, '.ab-compare__play': toggle, '.ab-compare__status': status, '.ab-compare__frame': frame };
    stage.querySelector = name => incomplete ? null : elements[name];
    // Keep one public API for the shared window, with a separate transaction
    // fixture for each pair, as the real progressive engine groups by root.
    const apiTarget = {}, upgrade = progressiveFixture(apiTarget, stage, [before, after]);
    const visible = value => observers.get(frame)([{ target: frame, isIntersecting: value }]);
    const setHidden = value => {
      panel.setAttribute('aria-hidden', String(value));
      mutations.get(panel)();
    };
    const ready = async () => {
      for (const v of [before, after]) { v.readyState = 1; v.fire('loadedmetadata'); }
      for (const v of [before, after]) { v.readyState = 4; v.fire('canplay'); }
      await flush();
    };
    return { before, after, handle, toggle, status, frame, stage, panel, visible, setHidden, ready, upgrade, api: apiTarget.ProgressiveVideo };
  });
  const apiFor = video => groups.find(group => group.before === video || group.after === video).api;
  window.ProgressiveVideo = {
    isSwitching: video => apiFor(video).isSwitching(video),
    getIntent: video => apiFor(video).getIntent(video),
    setIntent: (video, patch) => apiFor(video).setIntent(video, patch)
  };
  const document = Object.assign(element(), { hidden: false, querySelectorAll: selector => selector === '[data-about-comparison]' ? groups.map(group => group.stage) : [] });
  const timers = new Map();
  let timerId = 0;
  vm.runInNewContext(source, {
    window, document,
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: id => timers.delete(id),
    IntersectionObserver: class { constructor(fn) { this.fn = fn; } observe(target) { observers.set(target, this.fn); } },
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(target) { mutations.set(target, this.fn); } }
  });
  return { ...groups[0], groups, motion, document, window, timers, unblock: () => { blocked = false; } };
}

test('inline comparison loads on entry, plays both sources and pauses offscreen', async () => {
  const s = setup();
  assert.equal(s.before.loads, 0);
  s.visible(true); await s.ready();
  assert.equal(s.before.paused, false); assert.equal(s.after.paused, false);
  assert.equal(s.before.currentTime, 5.25); assert.equal(s.after.currentTime, 5.25);
  assert.equal(s.timers.size, 0);
  s.visible(false);
  assert.equal(s.before.paused, true); assert.equal(s.after.paused, true);
  s.visible(true); await flush();
  assert.equal(s.before.paused, false);
  s.toggle.fire('click'); s.visible(true); await flush();
  assert.equal(s.before.paused, true, 'manual pause remains while still in the section');
  s.visible(false); s.visible(true); await flush();
  assert.equal(s.before.paused, false, 'returning to the section automatically resumes');
  assert.equal(s.after.paused, false);
});

test('back-forward page restoration resumes a visible autoplaying comparison', async () => {
  const s = setup(); s.visible(true); await s.ready();
  s.window.fire('pagehide');
  assert.equal(s.before.paused, true);
  s.window.fire('pageshow'); await flush();
  assert.equal(s.before.paused, false); assert.equal(s.after.paused, false);
});

test('reduced motion keeps draggable posters until explicit play, using mobile variants', async () => {
  const s = setup({ reduced: true, mobile: true });
  s.visible(true);
  assert.equal(s.before.loads, 0);
  s.handle.fire('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(s.handle.attrs['aria-valuenow'], '52');
  s.toggle.fire('click'); await s.ready();
  assert.equal(s.before.src, 'previs-mobile.m4v');
  assert.equal(s.before.paused, false);
  s.motion.fire('change');
  assert.equal(s.before.paused, true);
});

test('keyboard clamps the divider and the follower corrects timing drift', async () => {
  const s = setup(); s.visible(true); await s.ready();
  s.handle.fire('keydown', { key: 'End', preventDefault() {} });
  s.handle.fire('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(s.handle.attrs['aria-valuenow'], '96');
  s.handle.fire('keydown', { key: 'Home', preventDefault() {} });
  assert.equal(s.handle.attrs['aria-valuenow'], '4');
  s.after.currentTime = 2; s.before.currentTime = 1; s.after.fire('timeupdate');
  assert.equal(s.before.currentTime, 2);
  s.document.hidden = true; s.document.fire('visibilitychange');
  assert.equal(s.after.paused, true); assert.equal(s.before.paused, true);
});

test('failed or stalled loading can retry without disabling the comparison handle', async () => {
  const s = setup(); s.visible(true);
  [...s.timers.values()][0]();
  assert.equal(s.toggle.textContent, 'Retry comparison');
  s.toggle.fire('click'); await s.ready();
  assert.equal(s.before.loads, 2); assert.equal(s.before.paused, false);
  s.after.fire('error');
  assert.equal(s.before.paused, true);
  assert.equal(s.toggle.textContent, 'Retry comparison');
});

test('autoplay denial leaves an explicit working play button', async () => {
  const s = setup({ blocked: true }); s.visible(true); await s.ready();
  assert.equal(s.toggle.textContent, 'Play comparison');
  assert.equal(s.before.paused, true);
  s.unblock(); s.toggle.fire('click'); await flush();
  assert.equal(s.before.paused, false); assert.equal(s.after.paused, false);
});

test('HD metadata does not reapply the opening seek and a rollback preserves an explicit pause', async () => {
  const s = setup(); s.visible(true); await s.ready();
  s.before.currentTime = s.after.currentTime = 6.8;
  s.upgrade.begin(); s.upgrade.reset(s.before); s.upgrade.reset(s.after);
  assert.equal(s.toggle.textContent, 'Pause comparison');
  assert.equal(s.timers.size, 0);
  assert.equal(s.upgrade.finish().handled, true); await flush();
  assert.equal(s.before.currentTime, 6.8); assert.equal(s.after.currentTime, 6.8);
  assert.equal(s.after.paused, false);
  s.upgrade.begin(); s.toggle.fire('click');
  s.upgrade.reset(s.before); s.upgrade.reset(s.after);
  s.upgrade.finish('error'); await flush();
  assert.ok(s.before.paused && s.after.paused);
  assert.equal(s.toggle.textContent, 'Play comparison');
  assert.equal(s.before.loads, 1, 'rollback must not trigger the preview load path again');
  s.toggle.fire('click'); await flush();
  assert.equal(s.after.paused, false);
  s.upgrade.downloadError();
  assert.equal(s.toggle.textContent, 'Pause comparison', 'an optional HD download failure is not a preview failure');
});

test('a play promise aborted by HD replacement cannot block the new playback attempt', async () => {
  const s = setup();
  let rejectOld;
  const normalPlay = s.before.play;
  s.before.play = function () {
    this.play = normalPlay;
    return new Promise((_, reject) => { rejectOld = reject; });
  };
  s.visible(true); await s.ready();
  s.upgrade.begin(); s.upgrade.finish();
  rejectOld({ name: 'AbortError' }); await flush();
  assert.ok(!s.before.paused && !s.after.paused);
  assert.equal(s.toggle.textContent, 'Pause comparison');
  assert.equal(s.status.textContent, '');
});

test('two workflow comparisons load, pause and resume independently as their panels change', async () => {
  const s = setup({ comparisons: [
    { hidden: false, dataset: { startTime: '1', beforeLabel: 'original footage', afterLabel: 'DLSS + RTX enhanced' } },
    { hidden: true }
  ] });
  const [dlss, previs] = s.groups;
  dlss.visible(true); previs.visible(true); await dlss.ready();
  assert.equal(dlss.before.currentTime, 1);
  assert.equal(dlss.after.currentTime, 1);
  assert.equal(previs.before.loads, 0, 'an overlapping but hidden panel must not request media');
  assert.equal(dlss.handle.attrs['aria-valuetext'], '50 percent original footage, 50 percent DLSS + RTX enhanced');
  assert.equal(previs.handle.attrs['aria-valuetext'], '50 percent 3D previs, 50 percent AI render');

  dlss.setHidden(true); previs.setHidden(false); await previs.ready();
  assert.ok(dlss.before.paused && dlss.after.paused);
  assert.ok(!previs.before.paused && !previs.after.paused);
  assert.equal(previs.after.currentTime, 5.25, 'the original comparison keeps its opening frame');
  previs.toggle.fire('click');
  dlss.setHidden(false); await flush();
  assert.ok(!dlss.before.paused && !dlss.after.paused);
  assert.ok(previs.before.paused && previs.after.paused, 'another panel resuming cannot undo a manual pause');
  dlss.visible(false);
  assert.ok(dlss.before.paused && dlss.after.paused);
  assert.equal(s.timers.size, 0);
});

test('pointer dragging and synchronization affect only the owning comparison', async () => {
  const s = setup({ comparisons: [
    { dataset: { beforeLabel: 'original footage', afterLabel: 'DLSS + RTX enhanced' } }, {}
  ] });
  const [dlss, previs] = s.groups;
  dlss.visible(true); previs.visible(true);
  await Promise.all([dlss.ready(), previs.ready()]);
  const pointer = { isPrimary: true, pointerType: 'touch', pointerId: 7, clientX: 720, target: dlss.handle, preventDefault() {} };
  dlss.frame.fire('pointerdown', pointer);
  assert.equal(dlss.handle.attrs['aria-valuetext'], '72 percent original footage, 28 percent DLSS + RTX enhanced');
  assert.equal(dlss.stage.style['--compare-split'], '72%');
  previs.frame.fire('pointermove', { ...pointer, clientX: 400 });
  assert.equal(previs.handle.attrs['aria-valuenow'], '50');
  dlss.frame.fire('pointerup', pointer);
  dlss.frame.fire('pointermove', { ...pointer, clientX: 800 });
  assert.equal(dlss.handle.attrs['aria-valuenow'], '72', 'a released pointer cannot keep changing the split');
  previs.handle.fire('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.equal(previs.handle.attrs['aria-valuenow'], '48');
  assert.equal(dlss.handle.attrs['aria-valuenow'], '72');

  dlss.after.currentTime = 2; dlss.before.currentTime = 1;
  dlss.after.fire('timeupdate');
  assert.equal(dlss.before.currentTime, 2);
  assert.equal(previs.before.currentTime, 5.25);
  previs.after.currentTime = 7; previs.after.fire('timeupdate');
  assert.equal(previs.before.currentTime, 7);
  assert.equal(dlss.before.currentTime, 2);
});

test('an HD switch and rollback keep their own playhead, pause intent and status', async () => {
  const s = setup({ comparisons: [{ dataset: { startTime: '1' } }, {}] });
  const [dlss, previs] = s.groups;
  dlss.visible(true); previs.visible(true);
  await Promise.all([dlss.ready(), previs.ready()]);
  dlss.before.currentTime = dlss.after.currentTime = 2.4;
  previs.before.currentTime = previs.after.currentTime = 6.8;
  dlss.upgrade.begin(); dlss.upgrade.reset(dlss.before); dlss.upgrade.reset(dlss.after);
  assert.ok(!previs.before.paused && !previs.after.paused, 'the other pair continues during source replacement');
  assert.equal(previs.status.textContent, '');
  previs.toggle.fire('click');
  assert.equal(dlss.upgrade.intent(dlss.after).paused, false, 'pause controls cannot mutate another progressive group');
  assert.equal(dlss.upgrade.finish().handled, true); await flush();
  assert.equal(dlss.after.currentTime, 2.4, 'HD metadata must not reapply the configured opening seek');
  assert.ok(!dlss.before.paused && !dlss.after.paused);
  assert.ok(previs.before.paused && previs.after.paused);

  previs.upgrade.begin(); previs.upgrade.reset(previs.before); previs.upgrade.reset(previs.after);
  assert.equal(previs.upgrade.finish('error').handled, true); await flush();
  assert.equal(previs.after.currentTime, 6.8);
  assert.ok(previs.before.paused && previs.after.paused, 'rollback preserves only that group’s explicit pause');
  assert.ok(!dlss.before.paused && !dlss.after.paused);
  assert.equal(dlss.toggle.textContent, 'Pause comparison');
  assert.equal(previs.toggle.textContent, 'Play comparison');
  assert.equal(dlss.before.loads, 1); assert.equal(previs.before.loads, 1);
});

test('one failed comparison can retry while the other continues playing', async () => {
  const s = setup({ comparisons: [{}, {}] });
  const [first, second] = s.groups;
  first.visible(true); second.visible(true);
  await Promise.all([first.ready(), second.ready()]);
  first.after.fire('error');
  assert.equal(first.toggle.textContent, 'Retry comparison');
  assert.ok(second.status.textContent === '' && !second.before.paused && !second.after.paused);
  first.toggle.fire('click'); await first.ready();
  assert.equal(first.before.loads, 2);
  assert.equal(second.before.loads, 1);
  assert.ok(!first.before.paused && !second.before.paused);
});

test('start time accepts zero, clamps to the media duration and rejects invalid values', async () => {
  const s = setup({ comparisons: [
    { dataset: { startTime: '0' } },
    { dataset: { startTime: '20' } },
    { dataset: { startTime: '-1' } },
    { dataset: { startTime: 'Infinity', beforeLabel: ' ', afterLabel: '' } },
    { dataset: { startTime: 'bad' } }
  ] });
  for (const group of s.groups) { group.visible(true); await group.ready(); }
  assert.deepEqual(s.groups.map(group => group.after.currentTime), [0, 8.92, 5.25, 5.25, 5.25]);
  assert.equal(s.groups[3].handle.attrs['aria-valuetext'], '50 percent 3D previs, 50 percent AI render');
});

test('missing comparison markup does not prevent subsequent valid instances from initializing', async () => {
  const s = setup({ comparisons: [{ incomplete: true }, {}] });
  const valid = s.groups[1];
  valid.visible(true); await valid.ready();
  assert.ok(!valid.before.paused && !valid.after.paused);
  assert.equal(valid.toggle.hidden, false);
  assert.equal(s.groups[0].before.loads, 0);
  assert.doesNotThrow(() => setup({ comparisons: [] }));
});

test('a never-decoded about preview signals recovery and starts decoded HD at the configured opening', async () => {
  const s = setup(), failures = [];
  s.stage.addEventListener('video-loader:preview-failed', event => failures.push(event.detail.reason));
  s.visible(true); s.after.fire('error'); s.before.fire('error');
  assert.deepEqual(failures, ['media-error']);
  assert.equal(s.toggle.textContent, 'Retry comparison');
  s.upgrade.begin({ recovery: true });
  assert.equal(s.upgrade.intent(s.after).paused, false);
  assert.equal(s.upgrade.intent(s.after).time, 5.25);
  s.upgrade.finish(); await flush();
  assert.ok(!s.before.paused && !s.after.paused);
  assert.equal(s.after.currentTime, 5.25);
  assert.equal(s.toggle.textContent, 'Pause comparison');
  assert.equal(s.before.loads, 1);
});

test('about timeout is a genuine recovery signal and a user pause survives rescue', async () => {
  const s = setup(), failures = [];
  s.stage.addEventListener('video-loader:preview-failed', event => failures.push(event.detail.reason));
  s.visible(true); [...s.timers.values()][0]();
  assert.deepEqual(failures, ['timeout']);
  s.upgrade.begin({ recovery: true }); s.upgrade.finish(); await flush();
  s.toggle.fire('click'); s.after.fire('error');
  s.upgrade.begin({ recovery: true }); s.upgrade.finish(); await flush();
  assert.ok(s.before.paused && s.after.paused);
  assert.equal(s.toggle.textContent, 'Play comparison');
});

test('recovery signals and opening times stay scoped to each comparison instance', async () => {
  const s = setup({ comparisons: [{ dataset: { startTime: '1' } }, {}] });
  const [dlss, previs] = s.groups;
  const failures = [];
  for (const group of s.groups) group.stage.addEventListener('video-loader:preview-failed', event => {
    failures.push({ group, ...event.detail });
  });
  dlss.visible(true); previs.visible(true);
  dlss.after.fire('error'); dlss.before.fire('error');
  assert.equal(failures.length, 1, 'one pair emits only one recovery request per failure');
  assert.equal(failures[0].group, dlss);
  assert.equal(failures[0].videos[0], dlss.before);
  assert.equal(failures[0].videos[1], dlss.after);
  assert.equal(previs.status.textContent, 'Loading both views…');
  dlss.upgrade.begin({ recovery: true });
  assert.equal(dlss.upgrade.intent(dlss.after).time, 1, 'the DLSS rescue uses its configured opening');
  dlss.upgrade.finish(); await flush();
  assert.equal(dlss.before.currentTime, 1);
  assert.equal(dlss.after.currentTime, 1);
  assert.ok(!dlss.before.paused && !dlss.after.paused);

  previs.after.fire('error');
  assert.equal(failures.length, 2);
  assert.equal(failures[1].group, previs);
  previs.upgrade.begin({ recovery: true });
  assert.equal(previs.upgrade.intent(previs.after).time, 5.25, 'the original workflow retains its default opening');
  previs.upgrade.finish(); await flush();
  assert.equal(previs.after.currentTime, 5.25);
  assert.equal(dlss.after.currentTime, 1);
  assert.ok(!dlss.after.paused && !previs.after.paused);
  assert.equal(s.timers.size, 0);
});
