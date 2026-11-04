const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/ai-workflows.js'), 'utf8');
function setup({ hash = '', reduced = false, compact = false, offset = 0, ids = ['dlss-detail', 'camera-previs-to-ai', 'real-cinema-to-ai'] } = {}) {
  let scroll = 0, sectionTop = offset, queued = [], enhanced = false;
  const eventTarget = () => ({ events: {}, addEventListener(n, fn) { this.events[n] = fn; }, fire(n, event = {}) { this.events[n]?.(event); } });
  const item = id => ({ id, attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; }, scrollIntoView() { this.scrolled = true; } });
  const items = ids.map(item);
  const steps = items.map(i => Object.assign(eventTarget(), item(i.id), { style: { setProperty() {} }, getAttribute: () => `#${i.id}` }));
  const counter = {};
  const pin = { offsetHeight: 900 };
  const header = { getBoundingClientRect: () => ({ height: 92 }) };
  const css = {};
  const section = { offsetHeight: 1000 + items.length * 750, style: { setProperty(n, v) { css[n] = v; } }, classList: { toggle(n,v) { enhanced = v; } }, getBoundingClientRect: () => ({ top: sectionTop - scroll }),
    querySelector: s => ({ '.ai-workflows__pin': pin, '[data-workflow-counter]': counter })[s], querySelectorAll: s => s === '[data-workflow-item]' ? items : steps };
  const window = Object.assign(eventTarget(), { get scrollY() { return scroll; }, scrollTo({ top }) { scroll = top; this.fire('scroll'); } });
  Object.defineProperty(window, 'scrollY', { get: () => scroll });
  const location = { hash };
  const document = { querySelector: s => s === '[data-workflows]' ? section : header };
  vm.runInNewContext(source, { window, document, location, history: { replaceState(a,b,url) { location.hash = url; } }, matchMedia: q => Object.assign(eventTarget(), { matches: q.includes('reduced') ? reduced : compact }), requestAnimationFrame: fn => { queued.push(fn); return queued.length; }, ResizeObserver: class { observe() {} } });
  const flush = () => { while (queued.length) { const next = queued; queued = []; next.forEach(fn => fn()); } };
  flush();
  return { items, steps, counter, window, location, css, flush, get enhanced() { return enhanced; }, scrollTo: value => { window.scrollTo({ top: value }); flush(); }, resize(height, pinHeight) { section.offsetHeight = height; pin.offsetHeight = pinHeight; window.fire('resize'); flush(); } };
}
test('scroll traverses all three workflows in both directions with one accessible story', () => {
  const s = setup();
  for (const [position, selected] of [[0,0], [900,1], [1700,2], [900,1], [100,0]]) {
    s.scrollTo(position);
    assert.equal(s.counter.textContent, `0${selected + 1} / 03`);
    for (let i = 0; i < 3; i++) {
      assert.equal(s.items[i].inert, i !== selected);
      assert.equal(s.items[i].attrs['aria-hidden'], String(i !== selected));
      assert.equal(s.steps[i].attrs['aria-current'], String(i === selected));
    }
  }
  assert.equal(s.css['--workflow-count'], 3);
});
test('the new DLSS and both existing homepage deep links select their intended story', () => {
  for (const [index, id] of ['dlss-detail', 'camera-previs-to-ai', 'real-cinema-to-ai'].entries()) {
    const s = setup({ hash: `#${id}` });
    assert.equal(s.counter.textContent, `0${index + 1} / 03`);
    assert.equal(s.items[index].inert, false);
  }
});
test('directory links and browser hash changes reach each story without losing the existing anchors', () => {
  const s = setup({ hash: '#real-cinema-to-ai' });
  for (const index of [1, 0, 2]) {
    s.steps[index].fire('click', { preventDefault() {} }); s.flush();
    assert.equal(s.location.hash, `#${s.items[index].id}`);
    assert.equal(s.counter.textContent, `0${index + 1} / 03`);
  }
  s.location.hash = '#camera-previs-to-ai'; s.window.fire('hashchange'); s.flush();
  assert.equal(s.counter.textContent, '02 / 03');
});
test('a banner above the workflows preserves deep links and scroll thresholds', () => {
  const s = setup({ hash: '#real-cinema-to-ai', offset: 680 });
  assert.equal(s.counter.textContent, '03 / 03');
  assert.equal(s.window.scrollY, 680 + 2250 * 2.5 / 3);
  s.scrollTo(780); assert.equal(s.counter.textContent, '01 / 03');
  s.scrollTo(1580); assert.equal(s.counter.textContent, '02 / 03');
  s.scrollTo(2380); assert.equal(s.counter.textContent, '03 / 03');
});
test('resizing preserves the active story and normalized position inside the pinned section', () => {
  const s = setup(); s.scrollTo(1700); s.resize(2500, 611);
  assert.equal(s.counter.textContent, '03 / 03');
  assert.ok(Math.abs(s.window.scrollY - (2500 - 611 - 100) * 1700 / 2250) < 1);
  s.scrollTo(2400); s.resize(2000, 700);
  assert.equal(s.window.scrollY, 2400, 'do not pull visitors back after they leave the workflow section');
});
test('reduced motion and short viewports retain all three complete stories in document flow', () => {
  for (const options of [{ reduced: true }, { compact: true }]) {
    const s = setup({ ...options, hash: '#real-cinema-to-ai' });
    assert.equal(s.enhanced, false);
    for (const item of s.items) { assert.equal(item.inert, false); assert.equal(item.attrs['aria-hidden'], undefined); }
    assert.equal(s.items[2].scrolled, true);
    assert.equal(s.counter.textContent, '03 / 03');
  }
});
test('counts and terminal scroll positions are derived from the number of stories', () => {
  for (const ids of [['only-story'], ['one', 'two', 'three', 'four']]) {
    const s = setup({ ids });
    s.scrollTo(10000);
    assert.equal(s.counter.textContent, `${String(ids.length).padStart(2, '0')} / ${String(ids.length).padStart(2, '0')}`);
    assert.equal(s.items.at(-1).inert, false);
    assert.equal(s.css['--workflow-count'], ids.length);
    s.scrollTo(-100);
    assert.equal(s.items[0].inert, false);
  }
});

test('AI page publishes the DLSS pair first with responsive sources and an independent 4K link', () => {
  const html = fs.readFileSync(require.resolve('../ai/index.html'), 'utf8');
  const stories = [...html.matchAll(/<article class="ai-workflows__item" id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(stories, ['dlss-detail', 'camera-previs-to-ai', 'real-cinema-to-ai']);
  const dlss = html.match(/<article class="ai-workflows__item" id="dlss-detail"[\s\S]*?<\/article>/)[0];
  assert.match(dlss, /data-about-comparison data-progressive-group data-start-time="1"/);
  assert.match(dlss, /Redefine every detail\./);
  assert.match(dlss, /Seedance 2\.5/);
  assert.match(dlss, /datetime="2026-11">11\/2026/);
  assert.match(dlss, /本地生成/);
  const videos = [...dlss.matchAll(/<video\b[^>]+>/g)].map(match => match[0]);
  assert.equal(videos.length, 2);
  for (const video of videos) {
    assert.match(video, /muted loop playsinline preload="none"/);
    for (const attr of ['data-src', 'data-src-mobile', 'data-src-hd']) assert.match(video, new RegExp(`${attr}="[^" ]+\\.mp4"`));
  }
  assert.match(dlss, /class="ai-workflows__quality" href="\.\.\/assets\/videos\/dlss-detail\/enhanced-4k-audio-v1\.mp4"/);
});
