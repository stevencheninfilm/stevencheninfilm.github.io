const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/ai-workflows.js'), 'utf8');
function setup({ hash = '', reduced = false, compact = false, phone = false, offset = 0,
  ids = ['dlss-detail', 'camera-previs-to-ai', 'real-cinema-to-ai'], pictureHeight = 360, overflow = 0,
  deferredFonts = false, navigationType = 'navigate' } = {}) {
  let scroll = 0, sectionTop = offset, enhanced = false, frameId = 0, intersection, resizeObserver;
  const queued = new Map(), classes = new Set(), reads = { section: 0, items: 0, pictures: 0 };
  const eventTarget = () => ({ events: {}, addEventListener(n, fn) { this.events[n] = fn; }, fire(n, event = {}) { this.events[n]?.(event); } });
  const window = Object.assign(eventTarget(), { scrollTo({ top }) { scroll = top; this.fire('scroll'); } });
  Object.defineProperty(window, 'scrollY', { get: () => scroll });
  const baseItem = id => ({ id, attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; } });
  const items = ids.map((id, index) => Object.assign(baseItem(id), {
    clientHeight: 700, scrollHeight: 700 + overflow,
    getBoundingClientRect() { reads.items++; return { top: sectionTop + index * 900 - scroll, bottom: sectionTop + index * 900 + 780 - scroll, height: 780 }; },
    scrollIntoView(options) { this.scrolled = true; this.scrollOptions = options; window.scrollTo({ top: sectionTop + index * 900 - 100 }); },
    querySelector(selector) {
      if (selector === '.ab-compare__frame, .workflow-player__picture') return {
        getBoundingClientRect() { reads.pictures++; return { width: 640, height: pictureHeight }; }
      };
      return null;
    }
  }));
  const steps = items.map(i => Object.assign(eventTarget(), baseItem(i.id), { style: { setProperty() {} }, getAttribute: () => `#${i.id}` }));
  const counter = {};
  const pin = { offsetHeight: 900 };
  const header = { getBoundingClientRect: () => ({ height: 92 }) };
  const css = {};
  const section = { offsetHeight: 1000 + items.length * 750, style: { setProperty(n, v) { css[n] = v; } },
    classList: { toggle(name, value) { if (value) classes.add(name); else classes.delete(name); enhanced = classes.has('is-enhanced'); } },
    getBoundingClientRect() { reads.section++; return { top: sectionTop - scroll }; },
    querySelector: selector => ({ '.ai-workflows__pin': pin, '[data-workflow-counter]': counter })[selector],
    querySelectorAll: selector => selector === '[data-workflow-item]' ? items : steps };
  const location = { hash };
  const document = { readyState: 'loading', querySelector: selector => selector === '[data-workflows]' ? section : header };
  let resolveFonts;
  if (deferredFonts) document.fonts = { ready: new Promise(resolve => { resolveFonts = resolve; }) };
  const preferences = {
    motion: Object.assign(eventTarget(), { matches: reduced }), compact: Object.assign(eventTarget(), { matches: compact }),
    phone: Object.assign(eventTarget(), { matches: phone })
  };
  window.IntersectionObserver = class {};
  vm.runInNewContext(source, {
    window, document, location, history: { replaceState(a,b,url) { location.hash = url; } },
    performance: { getEntriesByType: () => [{ type: navigationType }] },
    matchMedia: query => preferences[query.includes('reduced') ? 'motion' : query.includes('max-height') ? 'compact' : 'phone'],
    requestAnimationFrame: fn => { queued.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => queued.delete(id),
    ResizeObserver: class { constructor(callback) { resizeObserver = callback; } observe() {} },
    IntersectionObserver: class { constructor(callback) { intersection = callback; } observe() {} }
  });
  const flush = () => {
    let rounds = 0;
    while (queued.size) {
      if (++rounds > 30) throw new Error('Unbounded animation-frame loop');
      const next = [...queued.values()]; queued.clear(); next.forEach(fn => fn());
    }
  };
  flush();
  return { items, steps, counter, window, location, css, flush, classes, reads, resolveFonts,
    get enhanced() { return enhanced; }, get pendingFrames() { return queued.size; },
    scrollTo: value => { window.scrollTo({ top: value }); flush(); },
    resize(height, pinHeight) { section.offsetHeight = height; pin.offsetHeight = pinHeight; window.fire('resize'); flush(); },
    setPictureHeight(height) { pictureHeight = height; },
    contentResize() { resizeObserver(); flush(); },
    setNear(value) { intersection([{ isIntersecting: value }]); flush(); },
    setPreference(name, value) { preferences[name].matches = value; preferences[name].fire('change'); flush(); }
  };
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
test('phones, reduced motion and short viewports retain all three complete stories in document flow', () => {
  for (const options of [{ reduced: true }, { compact: true }, { phone: true }]) {
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

test('natural phone scrolling keeps every story accessible while updating the current directory entry', () => {
  const s = setup({ phone: true });
  assert.equal(s.classes.has('is-flow'), true);
  for (const [position, selected] of [[0, 0], [1000, 1], [1900, 2], [100, 0]]) {
    s.scrollTo(position);
    assert.equal(s.window.scrollY, position, 'scroll tracking must never snap the reading position');
    assert.equal(s.counter.textContent, `0${selected + 1} / 03`);
    s.items.forEach(item => { assert.equal(item.inert, false); assert.equal(item.attrs['aria-hidden'], undefined); });
    s.steps.forEach((step, index) => assert.equal(step.attrs['aria-current'], String(index === selected)));
  }
});

test('offscreen workflows stop scroll-frame layout reads and resume at the current story on entry', () => {
  for (const phone of [false, true]) {
    const s = setup({ phone });
    s.setNear(false);
    const before = { ...s.reads };
    for (const position of [100, 600, 1100, 1900]) s.scrollTo(position);
    assert.deepEqual(s.reads, before);
    assert.equal(s.pendingFrames, 0);
    s.setNear(true);
    assert.equal(s.counter.textContent, '03 / 03');
    assert.ok(s.reads[phone ? 'items' : 'section'] > before[phone ? 'items' : 'section']);
  }
});

test('pinned layout fit checks run on layout changes instead of every scroll frame', () => {
  const s = setup();
  const initialPictures = s.reads.pictures;
  assert.equal(initialPictures, 3);
  for (const position of [0, 300, 900, 1700]) s.scrollTo(position);
  assert.equal(s.reads.pictures, initialPictures);
  s.contentResize();
  assert.equal(s.reads.pictures, initialPictures + 3);
});

test('clipped desktop content or an undersized picture falls back without a resize-observer loop', () => {
  for (const options of [{ pictureHeight: 150 }, { overflow: 40 }]) {
    const s = setup(options);
    assert.equal(s.enhanced, false);
    assert.equal(s.classes.has('is-fit-fallback'), true);
    s.items.forEach(item => { assert.equal(item.inert, false); assert.equal(item.attrs['aria-hidden'], undefined); });
  }
  const s = setup();
  s.setPictureHeight(140);
  s.contentResize();
  assert.equal(s.enhanced, false);
  s.setPictureHeight(360);
  s.contentResize();
  assert.equal(s.enhanced, false, 'content-size changes cannot repeatedly retry the same pinned layout');
  s.resize(3250, 900);
  assert.equal(s.enhanced, true, 'a deliberate viewport change can retry a fitting pinned layout');
  assert.equal(s.classes.has('is-fit-fallback'), false);
});

test('returning or changing responsive mode does not jump to an old workflow hash', () => {
  const s = setup({ phone: true, hash: '#dlss-detail' });
  s.scrollTo(1900);
  s.window.fire('pageshow', { persisted: true }); s.flush();
  assert.equal(s.window.scrollY, 1900);
  assert.equal(s.counter.textContent, '03 / 03');
  s.setPreference('phone', false);
  assert.equal(s.enhanced, true);
  assert.equal(s.window.scrollY, 1900);
  s.setPreference('motion', true);
  assert.equal(s.enhanced, false);
  assert.equal(s.window.scrollY, 1900);
});

test('deep links resolve a pending offscreen fit fallback before selecting a natural-flow target', () => {
  const s = setup();
  s.setNear(false);
  // Long natural-flow articles need different coordinates from the pinned reel.
  s.items.forEach((item, index) => {
    item.getBoundingClientRect = () => ({ top: index * 1400 - s.window.scrollY, bottom: (index + 1) * 1400 - s.window.scrollY, height: 1400 });
    item.scrollIntoView = () => { item.scrolled = true; s.window.scrollTo({ top: index * 1400 - 100 }); };
  });
  s.setPictureHeight(140);
  s.contentResize();
  assert.equal(s.enhanced, true, 'offscreen measurements wait for the next visible frame');
  s.location.hash = '#real-cinema-to-ai';
  s.window.fire('hashchange'); s.flush();
  assert.equal(s.enhanced, false);
  assert.equal(s.items[2].scrolled, true);
  assert.equal(s.items[2].getBoundingClientRect().top, 100);
  assert.equal(s.counter.textContent, '03 / 03');
});

test('initial deep links recover from later native fragment placement after the page is shown', () => {
  const s = setup({ hash: '#camera-previs-to-ai' });
  const target = s.window.scrollY;
  s.scrollTo(0); // Browser native fragment scroll runs after the first-rAF alignment.
  assert.equal(s.counter.textContent, '01 / 03');
  s.window.fire('pageshow', { persisted: false }); s.flush();
  assert.equal(s.counter.textContent, '02 / 03');
  assert.equal(s.window.scrollY, target);
  s.scrollTo(1700);
  s.window.fire('pageshow', { persisted: true }); s.flush();
  assert.equal(s.window.scrollY, 1700, 'the one-time alignment never replays on BFCache return');
});

test('initial final alignment waits for fonts and is canceled by reading or history restoration', async () => {
  const s = setup({ hash: '#real-cinema-to-ai', deferredFonts: true });
  s.scrollTo(0);
  s.window.fire('pageshow', { persisted: false }); s.flush();
  assert.equal(s.counter.textContent, '01 / 03');
  s.resolveFonts(); await new Promise(resolve => setImmediate(resolve)); s.flush();
  assert.equal(s.counter.textContent, '03 / 03');

  const reading = setup({ hash: '#camera-previs-to-ai' });
  reading.scrollTo(1700); reading.window.fire('wheel');
  reading.window.fire('pageshow', { persisted: false }); reading.flush();
  assert.equal(reading.window.scrollY, 1700, 'late page completion cannot interrupt an intentional scroll');

  const back = setup({ hash: '#camera-previs-to-ai', navigationType: 'back_forward' });
  back.scrollTo(1700); back.window.fire('pageshow', { persisted: false }); back.flush();
  assert.equal(back.window.scrollY, 1700, 'a non-BFCache history restore keeps its reading position too');
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
