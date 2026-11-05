const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/site.js'), 'utf8');
const helper = source.match(/const centerActiveThumbnail = \(behavior = reducedMotion \? 'auto' : 'smooth'\) => \{[\s\S]*?\n  \};/)[0];

function carousel({ index = 0, viewport = 428, width = 404, reduced = false, mode = 'expanded', nativeScroll = true } = {}) {
  let gutter = 0;
  const calls = [];
  const dock = {
    clientWidth: width, clientLeft: 0, scrollLeft: 0,
    get scrollWidth() { return 10 * 68 + 9 * 5 + gutter * 2; },
    getBoundingClientRect() { return { left: 12, width }; },
    style: { setProperty(name, value) { assert.equal(name, '--home-dock-center-gutter'); gutter = Number.parseFloat(value); } },
    ...(nativeScroll ? { scrollTo(options) { calls.push(options); this.scrollLeft = options.left; } } : {}),
  };
  const thumbnails = Array.from({ length: 10 }, (_, i) => ({
    getBoundingClientRect() { return { left: 12 + gutter + i * 73 - dock.scrollLeft, width: 68 }; },
    scrollIntoView() { assert.fail('centering a carousel must not scroll the document'); },
  }));
  const center = vm.runInNewContext(`${helper}; centerActiveThumbnail`, {
    window: { innerWidth: viewport }, thumbnailDock: dock, thumbnails, active: index,
    mode, reducedMotion: reduced, clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
  });
  return { dock, calls, center, thumbnail: thumbnails[index], gutter: () => gutter };
}

test('first, middle and last mobile thumbnails all reach the visible carousel center', () => {
  for (const index of [0, 4, 9]) {
    const s = carousel({ index });
    s.center();
    const rect = s.thumbnail.getBoundingClientRect();
    assert.equal(rect.left + rect.width / 2, 12 + s.dock.clientWidth / 2, `thumbnail ${index}`);
    assert.equal(s.gutter(), 168);
    assert.ok(s.dock.scrollLeft >= 0 && s.dock.scrollLeft <= s.dock.scrollWidth - s.dock.clientWidth);
    assert.ok(s.calls.every(call => call.behavior === 'smooth'));
  }
});

test('initial/resize placement and reduced motion are immediate, with no repeated scroll at rest', () => {
  for (const reduced of [false, true]) {
    const s = carousel({ index: 8, reduced });
    if (reduced) s.center();
    else s.center('auto');
    assert.equal(s.calls[0].behavior, 'auto');
    const count = s.calls.length;
    s.center();
    assert.equal(s.calls.length, count, 'an already centered thumbnail does not restart scrolling');
  }
});

test('desktop and overview leave scroll position alone, and older browsers retain direct positioning', () => {
  const desktop = carousel({ index: 5, viewport: 1440 });
  desktop.center();
  assert.equal(desktop.gutter(), 0);
  assert.equal(desktop.calls.length, 0);
  const overview = carousel({ index: 5, mode: 'strip' });
  overview.center();
  assert.equal(overview.calls.length, 0);
  const older = carousel({ index: 9, nativeScroll: false });
  older.center();
  assert.equal(older.dock.scrollLeft, 9 * 73);
});

test('manual carousel scrolling refreshes landing geometry once per frame without re-centering', () => {
  const handler = source.match(/thumbnailDock.addEventListener\('scroll', \(\) => \{[\s\S]*?\n  \}, \{ passive: true \}\);/)[0];
  const frames = [];
  let listener, geometryUpdates = 0;
  vm.runInNewContext(`let thumbnailScrollFrame = null; ${handler}`, {
    thumbnailDock: { addEventListener(event, callback, options) { assert.equal(event, 'scroll'); assert.equal(options.passive, true); listener = callback; } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    syncThumbnailGeometry() { geometryUpdates++; },
    centerActiveThumbnail() { assert.fail('free browsing must not snap back to the active project'); },
  });
  listener(); listener();
  assert.equal(frames.length, 1);
  assert.equal(geometryUpdates, 0);
  frames[0]();
  assert.equal(geometryUpdates, 1);
  listener();
  assert.equal(frames.length, 2);
});
