const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/about-comparison.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({ reduced = false, mobile = false, blocked = false } = {}) {
  const element = () => ({
    events: {}, attrs: {}, style: { setProperty() {} },
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); },
    fire(name, data = {}) { for (const fn of this.events[name] || []) fn(data); },
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
  let observer;
  const timers = new Map();
  let timerId = 0;
  vm.runInNewContext(source, { window, document, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} } });
  const visible = value => observer([{ isIntersecting: value }]);
  const ready = async () => {
    for (const v of [before, after]) { v.readyState = 1; v.fire('loadedmetadata'); }
    for (const v of [before, after]) { v.readyState = 4; v.fire('canplay'); }
    await flush();
  };
  return { before, after, handle, toggle, status, motion, document, window, visible, ready, timers, unblock: () => { blocked = false; } };
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
