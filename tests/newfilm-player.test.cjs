const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/film-player.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const element = () => ({
  events: {}, attrs: {},
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); },
  fire(name, event = {}) { for (const fn of this.events[name] || []) fn(event); },
  getAttribute(name) { return this.attrs[name] ?? null; },
});
function setup({ count = 1, mobile = false, connection, legacy = false } = {}) {
  const timers = new Map();
  let timerId = 0, now = 0;
  const entries = Array.from({ length: count }, (_, index) => {
    const video = Object.assign(element(), {
      dataset: { src: `desktop-${index}.mp4`, srcMobile: `mobile-${index}.mp4` },
      paused: true, currentTime: 0, loads: 0, requests: [],
      load() { this.loads++; this.currentTime = 0; },
      pause() { const wasPaused = this.paused; this.paused = true; if (!wasPaused) this.fire('pause'); },
      play() {
        if (this.throwOnPlay) throw this.throwOnPlay;
        this.paused = false;
        this.fire('play');
        if (legacy) return undefined;
        return new Promise((resolve, reject) => this.requests.push({ resolve, reject }));
      },
      start(index = this.requests.length - 1) { this.fire('playing'); this.requests[index]?.resolve(); },
    });
    Object.defineProperty(video, 'src', { get() { return this.attrs.src; }, set(value) { this.attrs.src = value; } });
    const button = Object.assign(element(), { hidden: true }), status = element();
    return { video, button, status, querySelector: selector => ({ video, '[data-film-play]': button, '[data-film-status]': status })[selector] };
  });
  const document = Object.assign(element(), { hidden: false, querySelectorAll: () => entries });
  const window = element();
  vm.runInNewContext(source, {
    document, window, navigator: { connection }, matchMedia: () => ({ matches: mobile }),
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    entries, document, window,
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
    resize(value) { mobile = value; },
  };
}

test('full films wait for a click and choose a compact source for mobile or constrained connections', () => {
  for (const options of [{ mobile: true }, { connection: { saveData: true } }, { connection: { effectiveType: '3g' } }]) {
    const s = setup(options), { video, button, status } = s.entries[0];
    assert.equal(video.loads, 0);
    assert.equal(video.src, undefined);
    button.fire('click');
    assert.equal(video.src, 'mobile-0.mp4');
    assert.equal(video.controls, true);
    video.start();
    assert.equal(button.hidden, true);
    assert.equal(status.textContent, '');
  }
  const s = setup();
  s.entries[0].button.fire('click');
  assert.equal(s.entries[0].video.src, 'desktop-0.mp4');
});

test('slow playback retries preserve the download and playhead, ignoring stale rejection', async () => {
  const s = setup(), { video, button, status } = s.entries[0];
  button.fire('click'); video.currentTime = 31;
  s.advance(15000);
  assert.equal(button.hidden, false);
  assert.match(status.textContent, /连接较慢/);
  button.fire('click');
  assert.equal(video.loads, 1, 'retrying a slow transfer must not restart its download');
  assert.equal(video.currentTime, 31);
  video.requests[0].reject({ name: 'NotAllowedError' });
  await flush();
  assert.equal(button.hidden, true, 'an old attempt cannot cover the new attempt');
  video.start(1);
  s.advance(15000);
  assert.equal(status.textContent, '');
  assert.equal(button.hidden, true);
});

test('a media error reloads on explicit retry and cannot leave an older play promise in control', async () => {
  const s = setup(), { video, button, status } = s.entries[0];
  button.fire('click'); video.fire('error');
  assert.equal(video.paused, true);
  assert.equal(button.textContent, '重新加载');
  assert.match(status.textContent, /加载失败/);
  button.fire('click');
  assert.equal(video.loads, 2);
  video.requests[0].reject({ name: 'NotSupportedError' });
  await flush();
  assert.equal(button.hidden, true);
  video.start(1);
  assert.equal(status.textContent, '');
});

test('hiding or leaving the page cancels waiting UI and requires an explicit resume at the same position', async () => {
  const s = setup(), { video, button, status } = s.entries[0];
  button.fire('click'); video.currentTime = 24;
  s.document.hidden = true; s.document.fire('visibilitychange');
  video.requests[0].reject({ name: 'AbortError' });
  await flush(); s.advance(15000);
  assert.equal(video.paused, true);
  assert.equal(status.textContent, '');
  assert.equal(button.textContent, '继续播放');
  s.document.hidden = false; s.document.fire('visibilitychange');
  assert.equal(video.paused, true, 'foregrounding must not start film audio automatically');
  button.fire('click'); video.start(1);
  assert.equal(video.loads, 1);
  assert.equal(video.currentTime, 24);
  s.window.fire('pagehide'); s.advance(15000);
  assert.equal(video.paused, true);
  assert.equal(status.textContent, '');
});

test('legacy play return values and a synchronous policy rejection remain recoverable', () => {
  const legacy = setup({ legacy: true }), old = legacy.entries[0];
  assert.doesNotThrow(() => old.button.fire('click'));
  old.video.start();
  assert.equal(old.button.hidden, true);
  const s = setup(), { video, button, status } = s.entries[0];
  video.throwOnPlay = { name: 'NotAllowedError' };
  button.fire('click');
  assert.equal(button.hidden, false);
  assert.match(status.textContent, /点按播放/);
  delete video.throwOnPlay;
  button.fire('click'); video.start();
  assert.equal(video.loads, 1);
  assert.equal(button.hidden, true);
});

test('starting a second full film pauses the first without losing its position or reviving its timer', async () => {
  const s = setup({ count: 2 }), [first, second] = s.entries;
  first.button.fire('click'); first.video.currentTime = 12;
  second.button.fire('click'); second.video.start();
  first.video.requests[0].reject({ name: 'AbortError' });
  await flush(); s.advance(15000);
  assert.equal(first.video.paused, true);
  assert.equal(first.video.currentTime, 12);
  assert.equal(first.status.textContent, '');
  assert.equal(second.video.paused, false);
  assert.equal(second.button.hidden, true);
  first.button.fire('click'); first.video.start(1);
  assert.equal(first.video.loads, 1);
  assert.equal(first.video.currentTime, 12);
  assert.equal(second.video.paused, true);
});
