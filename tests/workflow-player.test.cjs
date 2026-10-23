const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require.resolve('../assets/workflow-player.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const element = () => ({
  events: {}, attrs: {}, style: { setProperty() {} },
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); },
  fire(name, event = {}) { for (const fn of this.events[name] || []) fn(event); },
  setAttribute(name, value) { this.attrs[name] = value; },
  setPointerCapture() {},
});
function setup({ mobile = false, reduced = false, blocked = false, delay = 0 } = {}) {
  let selected = true, strip = false, mutation, intersection;
  let now = 0, timerId = 0;
  const timers = new Map();
  const card = { classList: { contains: () => selected } };
  const deck = { classList: { contains: () => strip } };
  const video = Object.assign(element(), {
    dataset: { src: 'desktop.mp4', srcMobile: 'mobile.mp4' },
    currentTime: 0, duration: 36.5, paused: true, muted: true, loads: 0,
    load() { this.loads++; },
    pause() { this.paused = true; this.fire('pause'); },
    play() { if (blocked) return Promise.reject(Error('autoplay blocked')); this.paused = false; this.fire('play'); return Promise.resolve(); }
  });
  const controls = element(), toggle = element(), seek = Object.assign(element(), { value: 0 }), clock = element(), sound = element(), status = element();
  const player = {
    dataset: { controlsDelay: String(delay) },
    querySelector: selector => ({ video, '[data-player-controls]': controls, '[data-player-toggle]': toggle, '[data-player-seek]': seek, '[data-player-time]': clock, '[data-player-sound]': sound, '[data-player-status]': status })[selector],
    closest: selector => ({ '.deck-card': card, '.project-deck': deck })[selector],
  };
  const motion = Object.assign(element(), { matches: reduced });
  const document = Object.assign(element(), { hidden: false, querySelectorAll: () => [player] });
  const window = Object.assign(element(), { IntersectionObserver: true });
  vm.runInNewContext(source, {
    window, document, matchMedia: query => query.includes('reduced') ? motion : { matches: mobile },
    IntersectionObserver: class { constructor(fn) { intersection = fn; } observe() {} },
    MutationObserver: class { constructor(fn) { mutation = fn; } observe() {} },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return { video, controls, toggle, seek, clock, sound, status, motion, document, window,
    visible: value => intersection([{ isIntersecting: value }]),
    select(value, overview = false) { selected = value; strip = overview; mutation(); },
    unblock() { blocked = false; },
    advance(ms) { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
  };
}

test('only the active expanded home card loads and plays, using the compact mobile file', async () => {
  const s = setup({ mobile: true });
  assert.equal(s.video.loads, 0);
  s.select(false); s.visible(true); assert.equal(s.video.loads, 0);
  s.select(true); await flush(); assert.equal(s.video.src, 'mobile.mp4'); assert.equal(s.video.paused, false);
  s.select(true, true); assert.equal(s.video.paused, true); assert.equal(s.controls.inert, true);
  s.select(true); await flush(); assert.equal(s.video.paused, false); assert.equal(s.video.loads, 1);
  s.document.hidden = true; s.document.fire('visibilitychange'); assert.equal(s.video.paused, true);
});

test('scrubbing seeks immediately, resumes a playing film, and preserves a manual pause', async () => {
  const s = setup(); s.visible(true); await flush();
  s.seek.fire('pointerdown', { pointerId: 1 }); assert.equal(s.video.paused, true);
  s.seek.value = 60; s.seek.fire('input'); assert.equal(s.video.currentTime, 21.9);
  s.seek.fire('pointerup'); await flush(); assert.equal(s.video.paused, false);
  s.toggle.fire('click'); assert.equal(s.video.paused, true);
  s.seek.fire('pointerdown', { pointerId: 2 }); s.seek.value = 20; s.seek.fire('input'); s.seek.fire('change');
  await flush(); assert.ok(Math.abs(s.video.currentTime - 7.3) < .001); assert.equal(s.video.paused, true);
  assert.equal(s.clock.textContent, '0:07 / 0:36');
  let stopped = false; s.controls.fire('pointerdown', { stopPropagation() { stopped = true; } }); assert.equal(stopped, true);
});

test('reduced motion waits for explicit play and blocked autoplay offers a working play button', async () => {
  const reduced = setup({ reduced: true }); reduced.visible(true); assert.equal(reduced.video.loads, 0);
  reduced.toggle.fire('click'); await flush(); assert.equal(reduced.video.paused, false);
  const s = setup({ blocked: true }); s.visible(true); await flush(); assert.equal(s.toggle.textContent, 'Play');
  s.unblock(); s.toggle.fire('click'); await flush(); assert.equal(s.video.paused, false);
  s.sound.fire('click'); assert.equal(s.video.muted, false); assert.equal(s.sound.attrs['aria-pressed'], 'true');
});

test('a failed source can retry without losing the controls', async () => {
  const s = setup(); s.visible(true); await flush(); s.video.fire('error');
  assert.equal(s.video.paused, true); assert.equal(s.toggle.textContent, 'Retry');
  s.toggle.fire('click'); await flush(); assert.equal(s.video.loads, 2); assert.equal(s.video.paused, false);
});

test('each new visit starts muted, while explicit sound stays on during playback and seeking', async () => {
  const s = setup(); s.visible(true); await flush();
  assert.equal(s.video.defaultMuted, true);
  assert.equal(s.video.muted, true);
  s.sound.fire('click'); assert.equal(s.video.muted, false);
  s.seek.fire('pointerdown', { pointerId: 1 }); s.seek.value = 40; s.seek.fire('input'); s.seek.fire('pointerup');
  await flush(); assert.equal(s.video.muted, false);
  s.select(false); s.select(true); await flush();
  assert.equal(s.video.muted, true); assert.equal(s.sound.textContent, 'Sound off');
  assert.equal(s.video.paused, false);
});

test('home transport appears after three uninterrupted seconds and restarts after leaving', () => {
  const s = setup({ delay: 3000 });
  s.visible(true);
  s.advance(2999); assert.equal(s.controls.attrs['data-visible'], 'false'); assert.equal(s.controls.inert, true);
  s.advance(1); assert.equal(s.controls.attrs['data-visible'], 'true'); assert.equal(s.controls.inert, false);
  s.select(false); assert.equal(s.controls.attrs['data-visible'], 'false');
  s.select(true); s.advance(2000); s.select(false); s.advance(2000);
  assert.equal(s.controls.attrs['data-visible'], 'false', 'a stale timer must not reveal hidden-card controls');
  s.select(true); s.advance(2999); assert.equal(s.controls.attrs['data-visible'], 'false');
  s.advance(1); assert.equal(s.controls.attrs['data-visible'], 'true');
  s.window.fire('pagehide'); s.advance(3000); assert.equal(s.controls.inert, true);
  s.window.fire('pageshow'); s.advance(3000); assert.equal(s.controls.inert, false);
});

test('detail page transport remains available immediately without the homepage delay', () => {
  const s = setup(); s.visible(true);
  assert.equal(s.controls.attrs['data-visible'], 'true'); assert.equal(s.controls.inert, false);
});
