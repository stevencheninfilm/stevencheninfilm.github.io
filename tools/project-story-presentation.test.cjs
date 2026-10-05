const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sampleScroll } = require('../assets/xuantian-project-story.js');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'projects/xuantian-jie.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/xuantian-project-story.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'assets/xuantian-project-story.js'), 'utf8');
const section = html.split('<section id="the-project"')[1].split('</section>')[0];

test('approved images, live bilingual copy and both chapter buttons remain intact', () => {
  assert.match(section, /data-scene="0"/);
  assert.match(section, /scene is-active" data-story-scene="0"/);
  assert.match(section, /第二幕：御剑飞行/);
  for (const file of ['project-arrival.webp', 'project-journey.webp']) {
    assert.match(section, new RegExp(file));
    assert.ok(fs.existsSync(path.join(root, 'assets/images/projects/xuantian-jie', file)));
  }
  assert.match(section, /少年陆昭初入仙界/);
  assert.match(section, /四大宗门之间/);
  assert.match(section, /分集连载、篇章递进/);
  assert.doesNotMatch(section, /概念预告片|域外骨舟|data-story-playback/);
});

test('scroll begins on scene one and advances only after a complete reading beat', () => {
  assert.equal(sampleScroll(-200, 700, 2).index, 0);
  assert.equal(sampleScroll(0, 700, 2).index, 0);
  assert.equal(sampleScroll(699, 700, 2).index, 0);
  assert.equal(sampleScroll(700, 700, 2).index, 1);
  assert.equal(sampleScroll(1399, 700, 2).index, 1);
});

test('last scene gets its own reading beat, then releases to the following section', () => {
  assert.equal(sampleScroll(700, 700, 2).released, false);
  assert.equal(sampleScroll(1399, 700, 2).released, false);
  assert.deepEqual(sampleScroll(1400, 700, 2), { index: 1, progress: 1, travel: 1400, released: true });
  assert.equal(sampleScroll(5000, 700, 2).index, 1);
});

test('reverse scrolling restores earlier scenes without timer or loop state', () => {
  assert.deepEqual([1600, 1200, 701, 699, 100, -100].map(y => sampleScroll(y, 700, 2).index), [1, 1, 1, 0, 0, 0]);
  for (let y = -500; y < 4000; y += 31) {
    const result = sampleScroll(y, 700, 2);
    assert.ok(result.progress >= 0 && result.progress <= 1);
  }
});

test('the timeline scales to additional images and a single image', () => {
  assert.deepEqual([0, 500, 1000, 1500, 2000].map(y => sampleScroll(y, 500, 4).index), [0, 1, 2, 3, 3]);
  assert.equal(sampleScroll(2000, 500, 4).released, true);
  assert.equal(sampleScroll(499, 500, 1).released, false);
  assert.equal(sampleScroll(500, 500, 1).released, true);
});

test('scroll stays native: passive listener, RAF updates, no wheel/touch traps or timers', () => {
  assert.match(js, /addEventListener\('scroll', requestUpdate, \{ passive: true \}\)/);
  assert.match(js, /requestAnimationFrame\(update\)/);
  assert.doesNotMatch(js, /preventDefault|setTimeout|setInterval|createSceneClock|addEventListener\(['"](?:wheel|touchmove)/);
  assert.match(css, /position: sticky; top: var\(--story-top/);
  assert.match(js, /step \* scenes\.length/);
});

test('small, short, failed-image and reduced-motion views retain all text in normal flow', () => {
  assert.match(js, /!failed && !motion\.matches && win\.innerWidth > 900/);
  assert.match(js, /panelHeight > available/);
  assert.match(js, /scene\.inert = hidden/);
  assert.match(js, /const hidden = pinned && i !== index/);
  assert.match(css, /:not\(\.is-scroll-story\) \.xj-project-story__scene \{ opacity: 1; visibility: visible/);
  assert.match(js, /image\.decode\(\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(section, /aria-hidden="true" inert/);
});

test('chapter buttons navigate the scroll timeline and text re-enters with each scene', () => {
  assert.match(js, /step \* \(index \+ \.25\)/);
  assert.match(js, /win\.scrollTo/);
  assert.match(css, /opacity \.65s \.3s/);
  assert.match(section, /data-story-hint/);
});
