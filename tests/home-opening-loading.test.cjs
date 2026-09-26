const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const motion = require('../assets/home-opening-motion.js');
const source = fs.readFileSync(require.resolve('../assets/home-opening.js'), 'utf8');

function opening(cached = false) {
  let now = 0, frameId = 0, reloads = 0;
  const frames = new Map(), listeners = {}, clickHandlers = {};
  const classes = new Set(['home-v3', 'is-loading', 'is-v3-loading']);
  const body = { classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: (...names) => names.forEach(c => classes.delete(c)) } };
  const images = Array.from({ length: 2 }, () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { complete: cached, src: '/poster.webp', decode: () => promise, resolve, reject };
  });
  const percent = { style: {}, hidden: true };
  const skip = { addEventListener: (name, fn) => { clickHandlers.skip = fn; } };
  const tiles = images.map((image, i) => ({ style: {}, dataset: { column: String(i), row: '0' }, querySelector: () => image }));
  const loader = { style: {}, dataset: {}, hidden: false,
    querySelector: selector => ({ '.v3-loader-percent': percent, '.v3-loader-tile--lead': tiles[0], '.v3-loader-skip': skip })[selector],
    querySelectorAll: selector => selector === 'img' ? images : tiles };
  const interfaces = [{ inert: false }];
  const work = { href: 'http://localhost/index.html', addEventListener: (name, fn) => { clickHandlers.work = fn; } };
  const window = { innerWidth: 1440, innerHeight: 900, StevenHomeOpening: motion,
    location: { href: 'http://localhost/index.html#featured-work', pathname: '/index.html', reload: () => { reloads++; }, assign: () => {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (name, fn) => { listeners[name] = fn; }, setTimeout: () => 1 };
  vm.runInNewContext(source, { window, URL, document: { body, activeElement: null,
    querySelector: selector => ({ '.v3-loader': loader, '[data-home-replay]': work })[selector],
    querySelectorAll: () => interfaces }, performance: { now: () => now },
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id), clearTimeout() {} });
  return { loader, percent, images, interfaces, clickHandlers, work, reloads: () => reloads,
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

test('cold-load progress counts ready images and disappears as soon as they settle', async () => {
  const app = opening();
  app.tick(50);
  assert.equal(app.percent.hidden, true, 'no flash for a fast load');
  app.tick(200);
  assert.equal(app.percent.hidden, false);
  assert.equal(app.percent.textContent, '0%');
  app.images[0].resolve();
  await Promise.resolve();
  app.tick(300);
  assert.equal(app.percent.textContent, '50%');
  app.tick(900);
  assert.equal(app.percent.textContent, '50%', 'elapsed time must not fake progress');
  app.images[1].resolve();
  await Promise.resolve();
  app.tick(910);
  assert.equal(app.percent.hidden, true);
  assert.equal(app.loader.dataset.phase, 'wall');
});

test('failed or stalled assets cannot trap visitors behind loading progress', async () => {
  const failed = opening();
  failed.images.forEach(image => image.reject(new Error('unavailable')));
  await Promise.resolve();
  failed.tick(20);
  assert.equal(failed.loader.dataset.phase, 'wall');
  const stalled = opening();
  stalled.tick(2100);
  assert.equal(stalled.percent.hidden, true);
  assert.equal(stalled.loader.dataset.phase, 'wall');
  stalled.tick(2100 + motion.timing.end - motion.timing.wallStart + 1);
  assert.equal(stalled.loader.hidden, true);
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
