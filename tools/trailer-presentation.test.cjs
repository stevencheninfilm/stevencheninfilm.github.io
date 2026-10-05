const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'projects/xuantian-jie.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/xuantian.css'), 'utf8');
const section = html.split('<section id="full-film"')[1].split('</section>')[0];
const rule = selector => {
  const start = css.indexOf(selector + ' {');
  assert.notEqual(start, -1, selector);
  return css.slice(start, css.indexOf('}', start) + 1);
};

test('screen and episode/platform rows retain stable anchors and accessible labels', () => {
  assert.match(section, /class="xj-viewing__cinema"/);
  assert.equal((section.match(/id="trailer"/g) || []).length, 1);
  assert.match(section, /<figcaption class="xj-screening__caption">/);
  assert.match(section, /aria-labelledby="episode-label"/);
  assert.match(section, /aria-labelledby="platform-label"/);
  assert.equal((section.match(/href="#trailer"/g) || []).length, 2);
});

test('video remains native, inline, manually started, with all recovery routes', () => {
  const video = section.match(/<video\b[^>]*>/)[0];
  for (const attribute of ['controls', 'playsinline', 'webkit-playsinline', 'x5-playsinline']) {
    assert.match(video, new RegExp('\\b' + attribute + '\\b'));
  }
  assert.doesNotMatch(video, /autoplay|\bmuted\b/);
  assert.match(video, /preload="metadata"/);
  assert.match(section, /class="xj-video-play"[^>]*hidden/);
  for (const hook of ['data-xj-player', 'xj-player-status', 'xj-player-help', 'xj-player-message', 'xj-player-retry']) {
    assert.ok(section.includes(hook), hook);
  }
  for (const route of ['xinpianchang.com/a13797765', 'v.douyin.com/xd9IZhTjrTY/', '直接打开视频']) {
    assert.ok(section.includes(route), route);
  }
});

test('screen is exactly 16:9; the original video is contained rather than cropped', () => {
  assert.match(rule('.xj-viewing .xj-video-shell'), /aspect-ratio: 16 \/ 9/);
  assert.match(rule('.xj-viewing .xj-video'), /object-fit: contain/);
  assert.doesNotMatch(rule('.xj-viewing .xj-video'), /filter|scale\(/);
});

test('cover veil cannot capture input and is only visible in the idle state', () => {
  assert.match(rule('.xj-viewing .xj-video-shell::after'), /opacity: 0/);
  assert.match(rule('.xj-viewing .xj-video-shell::after'), /pointer-events: none/);
  assert.match(rule('.xj-viewing .xj-video-shell[data-player-state="idle"]::after'), /opacity: 1/);
  assert.match(rule('.xj-page:has(.xj-viewing [data-player-state="playing"]) .xj-leaf'), /visibility: hidden/);
});

test('caption and selectors use normal flow; touch targets and reduced motion are retained', () => {
  assert.match(rule('.xj-viewing .xj-screening'), /position: relative/);
  assert.match(rule('.xj-viewing__row'), /position: relative/);
  assert.doesNotMatch(rule('.xj-viewing__row'), /position: absolute|top:/);
  assert.match(rule('.xj-viewing__choice'), /min-height: 44px/);
  assert.match(css.split('@media (prefers-reduced-motion: reduce)')[1], /xj-video-play__disc.*transition: none/);
});

test('compact screen expands with a 900ms Bezier layout transition, never pixel scaling', () => {
  const compact = rule('.xj-viewing__cinema');
  const expanded = rule('.xj-viewing__cinema:has(.xj-screening:not([hidden]) [data-screen-expanded="true"])');
  assert.match(compact, /width: calc\(var\(--xj-art-width\) \* \.7244\)/);
  assert.match(rule('.xj-viewing__stage'), /--xj-screen-duration: \.9s; --xj-screen-ease: cubic-bezier\(\.45,0,\.18,1\)/);
  assert.match(compact, /transition: width var\(--xj-screen-duration\) var\(--xj-screen-ease\)/);
  assert.match(expanded, /width: calc\(100% - 2 \* clamp\(20px, 5vw, 88px\)\)/);
  assert.match(expanded, /margin-top: 0/);
  assert.doesNotMatch(compact + expanded, /transform|scale\(/);
  assert.match(rule('.xj-viewing__stage'), /overflow-anchor: none/);
  assert.match(css.split('@media (prefers-reduced-motion: reduce)')[1], /\.xj-viewing__cinema \{ transition: none; \}/);
});

test('original artwork and dark field share the same first-play latch and timing as the screen', () => {
  assert.match(section, /class="xj-viewing__backdrop" aria-hidden="true"/);
  assert.doesNotMatch(rule('.xj-viewing__art'), /mask-image|opacity:/);
  assert.match(rule('.xj-viewing__backdrop'), /pointer-events: none/);
  const shade = rule('.xj-viewing__backdrop::before');
  assert.match(shade, /opacity: 0/);
  assert.match(shade, /transition: opacity var\(--xj-screen-duration\) var\(--xj-screen-ease\)/);
  assert.match(rule('.xj-viewing__stage:has(.xj-screening:not([hidden]) [data-screen-expanded="true"]) .xj-viewing__backdrop::before'), /opacity: 1/);
  assert.match(rule('.xj-viewing .xj-video-shell'), /transition: box-shadow var\(--xj-screen-duration\) var\(--xj-screen-ease\)/);
  assert.match(rule('.xj-viewing__backdrop::after'), /top: 81\.675%.*left: 15\.12%.*width: 72\.44%/);
  assert.match(rule('.xj-viewing__cinema'), /left: calc\(var\(--xj-art-width\) \* \.0134\).*margin: 0 auto/);
  assert.match(css.split('@media (prefers-reduced-motion: reduce)')[1], /xj-viewing__backdrop::before.*transition: none/);
});

test('compact artwork, heading and player share one height-aware coordinate space', () => {
  const stage = rule('.xj-viewing__stage');
  assert.match(stage, /--xj-screen-max: min\(1440px, max\(480px, calc\(\(100svh - 190px\) \* 16 \/ 9\)\)\)/);
  assert.match(stage, /--xj-art-width: min\(100%, calc\(var\(--xj-screen-max\) \* \.81 \/ \.7244\)\)/);
  for (const selector of ['.xj-viewing__backdrop', '.xj-viewing__heading']) {
    assert.match(rule(selector), /width: var\(--xj-art-width\)/);
    assert.match(rule(selector), /margin-inline: auto/);
  }
  assert.match(rule('.xj-viewing__heading'), /aspect-ratio: 1448 \/ 338/);
  assert.doesNotMatch(rule('.xj-viewing__cinema'), /max-width:|margin: -/);
  assert.match(rule('.xj-viewing__index'), /font-size: clamp\(12px, 1\.93cqw, 24px\)/);
});

test('viewing chapter label fits its text and stays single-line across font and viewport changes', () => {
  const label = rule('.xj-viewing__index');
  assert.match(label, /width: max-content/);
  assert.match(label, /min-width: 15\.54%/);
  assert.match(label, /max-width: calc\(67\.5% - 16px\)/);
  assert.match(label, /white-space: nowrap/);
  assert.doesNotMatch(label, /(?:^|[;{])\s*width: 15\.54%|max-height:/);
  const textPolicy = rule('.xj-page .xj-viewing__index');
  assert.match(textPolicy, /text-wrap: nowrap/);
  assert.match(textPolicy, /overflow-wrap: normal/);
  assert.match(textPolicy, /word-break: keep-all/);
  assert.match(css, /\.xj-viewing__index \{ position: static;[^}]*min-width: 0; max-width: 100%/);
  assert.match(css, /@container \(max-width: 650px\) \{\s*\.xj-viewing__index \{ padding-block: 0; \}/);
});

function playerFixture() {
  const make = () => ({ dataset: {}, hidden: true, listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    emit(type) { this.listeners[type]?.(); }
  });
  const shell = make(), video = make(), button = make(), window = make();
  const elements = { video, '.xj-video-play': button, '.xj-player-status': make(),
    '.xj-player-help': make(), '.xj-player-message': make(), '.xj-player-retry': make() };
  shell.querySelector = selector => elements[selector];
  Object.assign(video, { paused: true, readyState: 0, error: null, playCalls: 0,
    play() { this.playCalls++; this.paused = false; this.emit('play'); return Promise.resolve(); }, load() {} });
  Object.assign(window, { setTimeout() { return 1; }, clearTimeout() {} });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/xuantian-player.js'), 'utf8'), {
    document: { querySelector: () => shell }, window, navigator: { onLine: true }
  });
  return { shell, video, button, window };
}

test('initial cover stays compact; first click expands immediately without delaying native play', () => {
  const f = playerFixture();
  assert.equal(f.shell.dataset.screenExpanded, undefined);
  assert.equal(f.video.playCalls, 0);
  f.button.emit('click');
  assert.equal(f.shell.dataset.screenExpanded, 'true');
  assert.equal(f.shell.dataset.playerState, 'loading');
  assert.equal(f.video.playCalls, 1);
});

test('native playback also expands and pause/buffering/replay do not collapse the screen', () => {
  const f = playerFixture();
  f.video.paused = false;
  for (const event of ['play', 'playing', 'waiting', 'playing', 'pause', 'ended', 'play', 'error']) {
    f.video.emit(event);
    assert.equal(f.shell.dataset.screenExpanded, 'true', event);
  }
  f.video.paused = true;
  f.window.emit('pageshow');
  assert.equal(f.shell.dataset.screenExpanded, 'true');
});
