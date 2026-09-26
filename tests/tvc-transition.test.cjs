const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('assets/tvc-transition.js');

function harness({ home = true, reduced = false, ready = true, saved = null } = {}) {
  const windowEvents = {}, documentEvents = {}, classes = new Set();
  const styles = new Map(), storage = new Map(), frames = [], timers = new Map();
  if (saved) storage.set('steven-tvc-transition-v1', JSON.stringify(saved));
  const preference = { matches: reduced, addEventListener(type, fn) { this.change = fn; } };
  const image = { complete: ready, naturalWidth: ready ? 2114 : 0,
    addEventListener: () => {},
    getBoundingClientRect: () => ({ x: 20, y: 500, width: 960, height: 338 }) };
  const location = { href: `https://example.test/${home ? 'index.html' : 'tvc/index.html'}`, origin: 'https://example.test' };
  const link = { href: 'https://example.test/tvc/index.html', target: '', hasAttribute: () => false };
  vm.runInNewContext(source, {
    URL, Date, location, innerWidth: 1000, innerHeight: 900,
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    requestAnimationFrame: fn => frames.push(fn),
    setTimeout: (fn, delay) => { timers.set(fn, delay); return fn; }, clearTimeout: fn => timers.delete(fn),
    window: { matchMedia: () => preference, addEventListener: (name, fn) => { windowEvents[name] = fn; } },
    document: {
      currentScript: { src: 'https://example.test/assets/tvc-transition.js' },
      documentElement: { style: { setProperty: (name, value) => styles.set(name, value) }, classList: {
        add: name => classes.add(name), remove: (...names) => names.forEach(name => classes.delete(name))
      } },
      querySelector: selector => (selector.startsWith('.project-deck') === home ? image : null),
      addEventListener: (name, fn) => { documentEvents[name] = fn; }
    }
  });
  const click = (overrides = {}) => documentEvents.click({ button: 0, target: { closest: () => link }, ...overrides });
  const transition = () => {
    let finish;
    const result = { skipped: false, ready: Promise.resolve(), finished: new Promise(resolve => { finish = resolve; }),
      skipTransition() { this.skipped = true; }, finish: () => finish() };
    return result;
  };
  return { windowEvents, documentEvents, classes, preference, click, transition, link, styles, storage, timers,
    render: () => { for (let i = 0; i < 4; i++) frames.splice(0).forEach(fn => fn()); } };
}

test('both documents load the same small transition before their first render', () => {
  for (const file of ['index.html', 'index-v3.html', 'tvc/index.html']) {
    const head = read(file).split('</head>')[0];
    assert.match(head, /<link rel="stylesheet" href="(?:\.\.\/)?assets\/tvc-transition.css\?v=20260925-2">/);
    assert.match(head, /<script src="(?:\.\.\/)?assets\/tvc-transition.js\?v=20260925-2"><\/script>/);
    assert.doesNotMatch(head.match(/<script[^>]*tvc-transition.js[^>]*>/)[0], /defer|async|type="module"/);
  }
  assert.equal(read('index.html'), read('index-v3.html'));
  assert.match(read('tvc/index.html'), /rel="preload" as="image" href="[^"\n]+banner-editorial-20260925.webp"/);
});

test('the image moves at full opacity with matching unpadded aspect ratios', () => {
  const css = read('assets/tvc-transition.css');
  assert.match(css, /@view-transition \{ navigation: auto; \}/);
  assert.match(css, /\.deck-card--tvc.is-active \.deck-media--tvc-banner,[\s\S]*view-transition-name: tvc-artwork/);
  assert.match(css, /\.tvc-page \.tvc-banner > img \{ padding: 0; margin: 24px auto; \}/);
  assert.match(css, /animation-duration: 1050ms;/);
  assert.match(css, /cubic-bezier\(\.22, \.72, \.16, 1\)/);
  assert.match(css, /::view-transition-old\(tvc-artwork\) \{ opacity: 0; \}/);
  assert.match(css, /::view-transition-new\(tvc-artwork\) \{ opacity: 1; \}/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*navigation: none/);
});

test('ordinary image or text link arms the outgoing artwork and then cleans up', async () => {
  const h = harness();
  h.click();
  const transition = h.transition();
  h.windowEvents.pageswap({ viewTransition: transition, activation: { entry: { url: h.link.href } } });
  assert.equal(transition.skipped, false);
  assert.ok(h.classes.has('tvc-transition-out'));
  transition.finish();
  await transition.finished;
  assert.equal(h.classes.size, 0);
});

test('older Safari activation fallback still uses the normal native link', () => {
  const h = harness();
  h.click();
  const transition = h.transition();
  h.windowEvents.pageswap({ viewTransition: transition });
  assert.equal(transition.skipped, false);
  assert.ok(h.classes.has('tvc-transition-out'));
  assert.doesNotMatch(source, /preventDefault|pushState|innerHTML|location\.assign/);
});

test('keyboard activation also arms the image in browsers reporting button -1', () => {
  const h = harness(); h.click({ button: -1, detail: 0 });
  const transition = h.transition(); h.windowEvents.pageswap({ viewTransition: transition });
  assert.equal(transition.skipped, false);
  assert.ok(h.classes.has('tvc-transition-out'));
});

test('modified, cancelled, new-tab, overview, and wrong-destination navigation do not animate', () => {
  for (const overrides of [{ button: 1 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) {
    const h = harness(); h.click(overrides);
    const transition = h.transition(); h.windowEvents.pageswap({ viewTransition: transition });
    assert.equal(transition.skipped, true);
  }
  const tab = harness(); tab.link.target = '_blank'; tab.click();
  const blank = tab.transition(); tab.windowEvents.pageswap({ viewTransition: blank });
  assert.equal(blank.skipped, true);
  const other = harness(); other.click(); const unrelated = other.transition();
  other.windowEvents.pageswap({ viewTransition: unrelated, activation: { entry: { url: 'https://example.test/about.html' } } });
  assert.equal(unrelated.skipped, true);
  const overview = harness({ home: false }); overview.click(); const strip = overview.transition();
  overview.windowEvents.pageswap({ viewTransition: strip });
  assert.equal(strip.skipped, true);
});

test('destination binds the same image before painting and clears after completion', async () => {
  const h = harness({ home: false }); const transition = h.transition();
  h.windowEvents.pagereveal({ viewTransition: transition });
  assert.ok(h.classes.has('tvc-transition-in'));
  transition.finish(); await transition.finished;
  assert.equal(h.classes.size, 0);
});

test('history, reduced motion, unavailable image and unsupported browsers remain usable', () => {
  for (const options of [{}, { reduced: true }, { ready: false }, { home: false }]) {
    const h = harness(options); const transition = h.transition();
    h.windowEvents.pageswap({ viewTransition: transition });
    assert.equal(transition.skipped, true);
  }
  for (const options of [{ home: false, reduced: true }, { home: false, ready: false }]) {
    const h = harness(options); const transition = h.transition();
    h.windowEvents.pagereveal({ viewTransition: transition });
    assert.equal(transition.skipped, true);
    assert.equal(h.classes.size, 0);
  }
  const h = harness(); h.click(); h.windowEvents.pageswap({}); h.windowEvents.pagereveal({});
  assert.equal(h.classes.size, 0);
});

const handoff = () => ({ to: 'https://example.test/tvc/index.html', at: Date.now(), x: 100, y: 300, width: 800, height: 282 });

test('repeat-visit native abort uses a one-use prepaint geometry handoff', () => {
  const h = harness({ home: false, saved: handoff() });
  assert.ok(h.classes.has('tvc-fallback-pending'));
  assert.equal(h.storage.size, 0);
  h.windowEvents.pagereveal({}); h.render();
  assert.ok(h.classes.has('tvc-fallback-running'));
  assert.match(h.styles.get('--tvc-to-transform'), /^matrix\(1.2, 0, 0, [\d.]+, -80, 200\)$/);
  h.windowEvents.resize();
  assert.ok(h.classes.has('tvc-fallback-running'), 'same-size viewport notifications must not cancel the handoff');
  for (const fn of h.timers.keys()) fn();
  assert.equal(h.classes.size, 0);
});

test('native success removes the fallback before capture, never animates twice', async () => {
  const h = harness({ home: false, saved: handoff() }); const transition = h.transition();
  h.windowEvents.pagereveal({ viewTransition: transition });
  assert.ok(h.classes.has('tvc-transition-in'));
  assert.equal(h.classes.has('tvc-fallback-pending'), false);
  h.render();
  await transition.ready;
  assert.equal(h.timers.size, 0);
  transition.finish(); await transition.finished;
  assert.equal(h.classes.size, 0);
});

test('stale geometry is ignored, and input or missing images cannot trap the page', () => {
  const stale = harness({ home: false, saved: { ...handoff(), at: Date.now() - 10000 } });
  assert.equal(stale.classes.size, 0);
  const failed = harness({ home: false, saved: handoff(), ready: false });
  failed.windowEvents.pagereveal({}); failed.render();
  for (const fn of failed.timers.keys()) fn();
  assert.equal(failed.classes.size, 0);
  const interrupted = harness({ home: false, saved: handoff() });
  interrupted.windowEvents.pagereveal({}); interrupted.render(); interrupted.windowEvents.wheel();
  assert.equal(interrupted.classes.size, 0);
});
