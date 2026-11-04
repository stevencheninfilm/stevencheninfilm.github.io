const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('homepage renders its first poster and navigation without startup scripts or hidden image requests', () => {
  const html = read('index.html');
  assert.equal(html, read('index-v3.html'));
  assert.doesNotMatch(html.match(/<body[^>]*>/)[0], /is-loading|is-v3-loading/);
  assert.match(html, /<div class="v3-loader" hidden/);
  const wall = html.slice(html.indexOf('<div class="v3-loader-gallery"'), html.indexOf('<button class="v3-loader-skip"'));
  assert.equal([...wall.matchAll(/<img data-src=/g)].length, 25);
  assert.doesNotMatch(wall, /(?<!data-)\bsrc="/);
  const cards = [...html.matchAll(/<article class="deck-card\b[\s\S]*?<\/article>/g)].map(m => m[0]);
  assert.equal(cards.length, 10);
  for (const card of cards.slice(1)) {
    assert.doesNotMatch(card, /(?<!data-)\b(?:src|srcset|poster)="/);
    assert.match(card, /data-src="/);
  }
  const firstPosters = [...cards[0].matchAll(/\bposter="([^"]+)"/g)].map(match => match[1]);
  assert.equal(firstPosters.length, 2);
  for (const poster of firstPosters) {
    assert.ok(fs.statSync(path.join(__dirname, '..', poster)).size < 25000, 'first-frame artwork stays small');
    assert.ok(html.includes(`<link rel="preload" as="image" href="${poster}"`));
  }
  assert.match(html, /<a[^>]*href="about.html"/);
  assert.equal([...html.matchAll(/<link rel="stylesheet"/g)].length, 1, 'one blocking CSS request');
  for (const script of html.matchAll(/<script[^>]*\bsrc="[^"]+"[^>]*>/g)) assert.match(script[0], /\bdefer\b/);
  const dock = html.slice(html.indexOf('<div class="thumbnail-dock"'));
  const thumbnails = [...dock.matchAll(/<img (?:data-)?src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(thumbnails.length, 10);
  assert.ok(thumbnails.reduce((bytes, file) => bytes + fs.statSync(path.join(__dirname, '..', file)).size, 0) < 70000);
  assert.equal([...dock.matchAll(/<img src=/g)].length, 1, 'offscreen thumbnails wait for viewport observation');
});

const mediaLoader = cards => {
  const code = read('assets/site.js').match(/const ensureCardMedia = \(index, preview = false\) => \{[\s\S]*?\n  \};/)[0];
  return vm.runInNewContext(`${code};ensureCardMedia`, { cards });
};
const image = (src, preview) => ({
  dataset: { src, preview },
  getAttribute(name) { return this[name]; },
  removeAttribute(name) { if (name === 'data-src') delete this.dataset.src; }
});

test('a visible strip preview defers full artwork and hidden logos until the project is expanded', async () => {
  let decodes = 0;
  const images = [image('/hero.jpg', '/small.webp'), image('/logo.webp')];
  images.forEach(img => { img.decode = () => { decodes++; return Promise.resolve(); }; });
  const source = { dataset: { srcset: '/mobile.jpg' }, removeAttribute() { delete this.dataset.srcset; } };
  const card = { dataset: {}, querySelector: () => null,
    querySelectorAll: selector => ({ 'img[data-src]': images, 'img[data-preview]': [images[0]], 'source[data-srcset]': [source] })[selector] || [] };
  const load = mediaLoader([card]);
  await load(0, true);
  assert.equal(images[0].src, '/small.webp');
  assert.equal(images[1].src, undefined);
  assert.equal(source.srcset, undefined);
  assert.equal(decodes, 0);
  assert.equal(images[0].dataset.src, '/hero.jpg');
  assert.equal(card.dataset.mediaLoaded, undefined);
  await load(0);
  assert.equal(images[0].src, '/hero.jpg'); assert.equal(images[1].src, '/logo.webp');
  assert.equal(source.srcset, '/mobile.jpg'); assert.equal(decodes, 2);
  await load(0, true); await load(0);
  assert.equal(images[0].src, '/hero.jpg', 'returning to strip must not downgrade a ready project');
  assert.equal(decodes, 2);
  await load(999);
});

test('comparison and workflow posters hydrate on selection while their media controllers retain source ownership', async () => {
  for (const comparison of [true, false]) {
    const videos = [0, 1].map(i => ({ dataset: { poster: `/full-${i}.webp`, posterPreview: `/small-${i}.webp` },
      hasAttribute: attr => attr === 'data-workflow-video', removeAttribute(attr) { if (attr === 'data-poster') delete this.dataset.poster; },
      load() { assert.fail('card navigation must not start a video download'); } }));
    const card = { dataset: {}, classList: { contains: () => comparison }, querySelector: () => videos[0],
      querySelectorAll: selector => selector === 'video[data-poster]' ? videos.filter(video => video.dataset.poster) : [] };
    const load = mediaLoader([card]);
    assert.ok(videos.every(video => !video.poster));
    await load(0, true);
    assert.deepEqual(videos.map(video => video.poster), ['/small-0.webp', '/small-1.webp']);
    await load(0);
    assert.deepEqual(videos.map(video => video.poster), ['/full-0.webp', '/full-1.webp']);
    assert.ok(videos.every(video => !video.src));
    assert.equal(card.dataset.mediaLoaded, undefined);
  }
});

test('mobile dock loads only intersecting thumbnails and still supports browsers without observers', () => {
  const source = read('assets/home-v2.js');
  const setup = (observed = true) => {
    const images = [image('/one.webp'), image('/two.webp')];
    const unobserved = [], observedImages = [];
    let callback;
    const dock = { querySelectorAll: () => images };
    const deck = { addEventListener() {} }, pagination = { addEventListener() {} };
    class IntersectionObserver {
      constructor(fn, options) { callback = fn; assert.equal(options.root, dock); }
      observe(image) { observedImages.push(image); }
      unobserve(image) { unobserved.push(image); }
    }
    vm.runInNewContext(source, {
      window: { ...(observed ? { IntersectionObserver } : {}), addEventListener() {} }, IntersectionObserver,
      document: { querySelector: selector => ({ '.project-deck': deck, '.home-pagination': pagination, '.thumbnail-dock': dock })[selector] }
    });
    return { images, callback, unobserved, observedImages };
  };
  const app = setup();
  assert.equal(app.observedImages.length, 2);
  assert.ok(app.images.every(image => !image.src));
  app.callback([{ target: app.images[0], isIntersecting: true }, { target: app.images[1], isIntersecting: false }]);
  assert.equal(app.images[0].src, '/one.webp');
  assert.equal(app.images[1].src, undefined);
  assert.deepEqual(app.unobserved, [app.images[0]]);
  assert.ok(setup(false).images.every(image => image.src), 'fallback thumbnails remain usable');
});


test('language links restore exact project IDs while missing or invalid IDs keep the first project', () => {
  const source = read('assets/site.js');
  const initialization = source.slice(0, source.indexOf("  let mode = 'expanded';")) + '\nreturn active;\n})();';
  const cards = Array.from({ length: 10 }, (_, index) => ({ dataset: { page: String(index - 1) } }));
  for (const [search, expected] of [['', 0], ['?project=-1', 0], ['?project=0', 1], ['?project=1', 2], ['?campaign=home&project=8', 9], ['?project=9', 0], ['?project=-2', 0], ['?project=1.5', 0], ['?project=', 0], ['?project=unknown', 0]]) {
    const active = vm.runInNewContext(initialization, {
      URLSearchParams,
      window: { location: { search }, matchMedia: () => ({ matches: false }) },
      document: { documentElement: { lang: 'zh-Hans' }, querySelector: () => ({}), querySelectorAll: selector => selector === '.deck-card' ? cards : [] }
    });
    assert.equal(active, expected, search || '(no query)');
  }
});
