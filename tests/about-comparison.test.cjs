const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/about-comparison.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const progressiveFixture = require('./progressive-controller-fixture.cjs');

function setup({ reduced = false, mobile = false, blocked = false } = {}) {
  const element = () => ({
    events: {}, attrs: {}, style: { setProperty() {} },
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); },
    fire(name, data = {}) { for (const fn of this.events[name] || []) fn(data); },
    dispatchEvent(event) { this.fire(event.type, event); },
    setAttribute(name, value) { this.attrs[name] = value; }
  });
  const video = name => Object.assign(element(), {
    dataset: { src: `${name}.m4v`, srcMobile: `${name}-mobile.m4v` },
    paused: true, readyState: 0, currentTime: 0, duration: 9, seeking: false, loads: 0,
    load() { this.loads++; this.readyState = 0; },
    pause() { this.paused = true; },
    play() { if (blocked) return Promise.reject(new Error('blocked')); this.paused = false; return Promise.resolve(); }
  });
  const before = video('previs'), after = video('ai'), handle = element(), toggle = element(), status = element();
  const frame = Object.assign(element(), { getBoundingClientRect: () => ({ left: 0, width: 1000 }) });
  const stage = element();
  const elements = { '.ab-compare__before': before, '.ab-compare__after video': after, '.ab-compare__handle': handle, '.ab-compare__play': toggle, '.ab-compare__status': status, '.ab-compare__frame': frame };
  stage.querySelector = name => elements[name];
  const motion = Object.assign(element(), { matches: reduced });
  const document = Object.assign(element(), { hidden: false, querySelector: () => stage });
  const window = Object.assign(element(), { matchMedia: query => query.includes('reduced') ? motion : { matches: mobile }, IntersectionObserver: true });
  const upgrade = progressiveFixture(window, stage, [before, after]);
  let observer;
  const timers = new Map();
  let timerId = 0;
  vm.runInNewContext(source, { window, document, CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } }, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} } });
  const visible = value => observer([{ isIntersecting: value }]);
  const ready = async () => {
    for (const v of [before, after]) { v.readyState = 1; v.fire('loadedmetadata'); }
    for (const v of [before, after]) { v.readyState = 4; v.fire('canplay'); }
    await flush();
  };
  return { before, after, handle, toggle, status, stage, motion, document, window, visible, ready, timers, upgrade, unblock: () => { blocked = false; } };
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
