const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const motion = require('../assets/home-opening-motion.js');
const source = fs.readFileSync(require.resolve('../assets/home-opening.js'), 'utf8');

function opening(cached = false, options = {}) {
  let now = options.start || 0, frameId = 0, reloads = 0, assigned = null;
  const frames = new Map(), listeners = {}, clickHandlers = {};
  const classes = new Set(['home-v3']);
  const body = { classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: (...names) => names.forEach(c => classes.delete(c)) } };
  const images = Array.from({ length: 2 }, () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { complete: cached, naturalWidth: cached ? 100 : 0, src: cached ? '/poster.webp' : undefined, dataset: { src: '/poster.webp' },
      getAttribute(name) { return this[name]; }, removeAttribute(name) { delete this[name]; }, decode: () => promise,
      resolve() { this.complete = true; this.naturalWidth = 100; resolve(); }, reject };
  });
  const percent = { style: {}, hidden: true };
  const skip = { addEventListener: (name, fn) => { clickHandlers.skip = fn; } };
  const tiles = images.map((image, i) => ({ style: {}, dataset: { column: String(i), row: '0' }, querySelector: () => image }));
  const loader = { style: {}, dataset: {}, hidden: true,
    querySelector: selector => ({ '.v3-loader-percent': percent, '.v3-loader-tile--lead': tiles[0], '.v3-loader-skip': skip })[selector],
    querySelectorAll: selector => selector === 'img' ? images : tiles };
  const interfaces = [{ inert: false }];
  const work = { href: options.workHref || 'http://localhost/index.html', addEventListener: (name, fn) => { clickHandlers.work = fn; } };
  const window = { innerWidth: 1440, innerHeight: 900, StevenHomeOpening: motion,
    location: { href: options.href || 'http://localhost/index.html#featured-work', pathname: options.pathname || '/index.html', search: options.search || '', reload: () => { reloads++; }, assign: href => { assigned = href; } },
    matchMedia: query => ({ matches: query.includes('reduced-motion') ? !!options.reduced : !!options.mobile, addEventListener() {} }),
    addEventListener: (name, fn) => { listeners[name] = fn; }, setTimeout: () => 1 };
  vm.runInNewContext(source, { window, URL, sessionStorage: { getItem: () => options.warm ? 'ready' : null, setItem() {} }, navigator: {connection:options.connection}, document: { body, activeElement: null,
    querySelector: selector => ({ '.v3-loader': loader, '[data-home-replay]': work })[selector],
    querySelectorAll: () => interfaces }, performance: { now: () => now },
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id), clearTimeout() {} });
  return { loader, percent, images, interfaces, clickHandlers, work, reloads: () => reloads, assigned: () => assigned,
    interact() { listeners.pointerdown({ target: { closest() {} } }); },
    resize(width, height) { window.innerWidth = width; window.innerHeight = height; listeners.resize(); },
    tick(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); } };
}

test('cached content starts the image wall immediately with no mandatory progress screen', () => {
  const app = opening(true);
  app.tick(0);
  assert.equal(app.loader.dataset.phase, 'wall');
  assert.equal(app.percent.hidden, true);
  app.tick(motion.timing.end - motion.timing.wallStart + 1);
  assert.equal(app.loader.hidden, true);
  assert.equal(app.interfaces[0].inert, false);
});

test('optional desktop artwork loads without hiding the usable page, then starts the original wall', async () => {
  const app = opening();
  app.tick(50);
  assert.equal(app.percent.hidden, true, 'no flash for a fast load');
  app.tick(200);
  assert.equal(app.percent.hidden, true);
  assert.equal(app.loader.hidden, true);
  assert.equal(app.interfaces[0].inert, false);
  assert.equal(app.percent.textContent, '0%');
  app.images[0].resolve();
  await Promise.resolve();
  app.tick(300);
  assert.equal(app.percent.textContent, '50%');
  app.tick(600);
  assert.equal(app.percent.textContent, '50%', 'elapsed time must not fake progress');
  app.images[1].resolve();
  await Promise.resolve();
  app.tick(610);
  assert.equal(app.percent.hidden, true);
  assert.equal(app.loader.dataset.phase, 'wall');
  assert.equal(app.loader.hidden, false);
  assert.equal(app.interfaces[0].inert, true);
});

test('failed or stalled assets cannot trap visitors behind loading progress', async () => {
  const failed = opening();
  failed.images.forEach(image => image.reject(new Error('unavailable')));
  await Promise.resolve();
  failed.tick(20);
  assert.equal(failed.loader.hidden, true);
  const stalled = opening();
  stalled.tick(700);
  assert.equal(stalled.loader.dataset.phase, 'complete');
  assert.equal(stalled.loader.hidden, true);
  assert.ok(stalled.images.every(image => !image.src), 'unfinished optional requests are cancelled');
});

test('Work reloads the homepage from a hash and preserves modified link clicks', () => {
  const app = opening(true);
  let prevented = false;
  const event = { button: 0, currentTarget: app.work, preventDefault: () => { prevented = true; } };
  app.clickHandlers.work({ ...event, metaKey: true });
  assert.equal(app.reloads(), 0);
  assert.equal(prevented, false);
  app.clickHandlers.work(event);
  assert.equal(app.reloads(), 1);
  assert.equal(prevented, true);
});

test('same-size viewport notifications do not cancel the opening', () => {
  const app = opening(true);
  app.resize(1440, 900);
  app.tick(100);
  assert.equal(app.loader.hidden, false);
  assert.equal(app.loader.dataset.phase, 'wall');
  app.resize(390, 844);
  assert.equal(app.loader.hidden, true, 'a real rotation safely reveals the responsive page');
});

 test('late scripts and data saver leave the visible homepage available', () => {
  for (const options of [{start:2000},{connection:{saveData:true}},{connection:{effectiveType:'slow-2g'}}]) {
    const app=opening(true,options);
    assert.equal(app.loader.hidden,true);
    assert.equal(app.interfaces[0].inert,false);
  }
});


test('cold mobile and reduced-motion visits never request the hidden opening wall', () => {
  for (const options of [{ mobile: true }, { reduced: true }, { mobile: true, connection: { effectiveType: '4g' } }]) {
    const app = opening(false, options);
    assert.ok(app.images.every(image => !image.src));
    assert.equal(app.loader.hidden, true);
    assert.equal(app.interfaces[0].inert, false);
    app.tick(100);
    assert.equal(app.loader.dataset.phase, 'complete');
  }
});

test('a previously ready mobile wall may replay without removing the desktop animation', async () => {
  const app = opening(false, { mobile: true, warm: true });
  assert.ok(app.images.every(image => image.src === '/poster.webp'));
  assert.equal(app.loader.hidden, true, 'the page remains usable while cache decoding completes');
  app.images.forEach(image => image.resolve());
  await Promise.resolve();
  app.tick(100);
  assert.equal(app.loader.dataset.phase, 'wall');
  assert.equal(app.loader.hidden, false);
});

test('using the visible homepage cancels a pending optional intro without blocking the action', async () => {
  const app = opening();
  app.interact();
  app.images.forEach(image => image.resolve());
  await Promise.resolve();
  app.tick(300);
  assert.equal(app.loader.hidden, true);
  assert.equal(app.loader.dataset.phase, 'complete');
  assert.equal(app.interfaces[0].inert, false);
});


test('Work clears a restored project query before replaying the first project in the same language', () => {
  const app = opening(true, { href: 'http://localhost/zh/index.html?project=1#featured-work', pathname: '/zh/index.html', search: '?project=1', workHref: 'http://localhost/zh/index.html' });
  let prevented = false;
  app.clickHandlers.work({ button: 0, currentTarget: app.work, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.reloads(), 0, 'reload would retain the project selection');
  assert.equal(app.assigned(), 'http://localhost/zh/index.html');
});
