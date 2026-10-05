const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'projects/xuantian-jie.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/xuantian.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets/xuantian-episodes.js'), 'utf8');
const episodeURLs = [
  'https://www.xinpianchang.com/a13833846?channel=copyLink&from=webShare',
  'https://v.douyin.com/LOKPgxiyZMI/',
  'https://www.bilibili.com/video/BV1QjH86bEvj/?share_source=copy_web&vd_source=017fe2b77e3ee35441400db7b7543f59',
  'https://weixin.qq.com/sph/AMsaXUkv0'
];

test('episode one and closing links use all four supplied destinations, independently of the trailer', () => {
  const platforms = html.split('id="episode-1-platforms"')[1].split('</nav>')[0].replaceAll('&amp;', '&');
  const ending = html.split('<section class="xj-end"')[1].split('</section>')[0].replaceAll('&amp;', '&');
  for (const url of episodeURLs) {
    assert.ok(platforms.includes(`href="${url}"`), url);
    assert.ok(ending.includes(`href="${url}"`), url);
  }
  for (const link of platforms.matchAll(/<a\b[^>]+>/g)) {
    assert.match(link[0], /target="_blank"/);
    assert.match(link[0], /rel="noopener noreferrer"/);
  }
  assert.doesNotMatch(platforms, /a13797765|xd9IZhTjrTY/);
  assert.doesNotMatch(html, /xj-watch-context|data-episode-play-label/);
  assert.equal((html.match(/\sdata-episode-play(?:\s|>)/g) || []).length, 1, 'only the cover launches onsite playback');
  assert.match(platforms, /在其他平台观看第一集/);
  assert.match(platforms, /新窗口打开/);
  const trailer = html.split('id="trailer-platforms"')[1].split('</nav>')[0];
  assert.match(trailer, /a13797765/);
  assert.match(trailer, /xd9IZhTjrTY/);
  assert.match(html, /src="\.\.\/assets\/videos\/xuantian-jie\/xuantian-jie-trailer\.mp4"/);
});

test('episode poster is uncropped and the official Douyin player loads only on request', () => {
  const poster = fs.readFileSync(path.join(root, 'assets/images/projects/xuantian-jie/episode-01-immortal-realm.png'));
  assert.equal(poster.readUInt32BE(16), 1672);
  assert.equal(poster.readUInt32BE(20), 941);
  const panel = html.match(/<figure id="episode-1"[\s\S]*?<\/figure>/)[0];
  assert.match(panel, /第一集 · 初入仙界/);
  assert.match(panel, /width="1672" height="941"/);
  assert.match(panel, /新窗口/);
  assert.doesNotMatch(panel, /<video|<iframe|01:40/);
  assert.doesNotMatch(panel.split('>')[0], /\shidden/);
  assert.match(panel, /data-embed-src="https:\/\/open\.douyin\.com\/player\/video\?vid=7691998330158599459&amp;autoplay=1&amp;mode=pc"/);
  assert.match(panel, /无法播放？前往抖音/);
  assert.match(html, /<figure id="trailer"[^>]*hidden/);
  assert.match(css, /\.xj-episode-cover img \{[^}]*object-fit: contain/);
  assert.match(css, /\.xj-viewing \[data-episode-platforms\]\[hidden\] \{ display: none; \}/);
  assert.match(html, /<noscript><style>\.xj-viewing \[data-episode-panel\]\[hidden\]/);
});

test('idle episode has a centered trailer-style play disc, clear title and duration', () => {
  const panel = html.match(/<figure id="episode-1"[\s\S]*?<\/figure>/)[0];
  assert.match(panel, /class="xj-video-play__disc" aria-hidden="true"/);
  assert.match(panel, /<svg class="xj-video-play__icon"/);
  assert.match(panel, /<b>播放第一集正片<\/b>/);
  assert.match(panel, /<small>04:35 · <span data-episode-source>/);
  assert.match(css, /\.xj-episode-cover__action \{[^}]*inset: 0;[^}]*flex-direction: column;[^}]*align-items: center; justify-content: center;/);
  assert.match(css, /\.xj-episode-cover::after \{[^}]*pointer-events: none/);
  assert.match(css, /\.xj-episode-cover:focus-visible \.xj-video-play__disc/);
  assert.doesNotMatch(css, /\.xj-episode-cover__action small \{[^}]*display: none/);
});

test('every external playback platform has a local decorative SVG before its name', () => {
  const marks = new Map([
    ['www.xinpianchang.com', 'xinpianchang-mark.svg'],
    ['v.douyin.com', 'douyin-mark.svg'],
    ['www.bilibili.com', 'bilibili-mark.svg'],
    ['weixin.qq.com', 'wechat-channels-mark.svg']
  ]);
  const blocks = [
    html.split('id="episode-1-platforms"')[1].split('</nav>')[0],
    html.split('id="trailer-platforms"')[1].split('</nav>')[0],
    html.split('<div class="xj-watch-links">')[1].split('</div>')[0]
  ];
  let count = 0;
  for (const block of blocks) {
    for (const match of block.matchAll(/<a\b[^>]*href="(https:[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const name = marks.get(new URL(match[1].replaceAll('&amp;', '&')).hostname);
      assert.ok(name);
      assert.ok(match[2].startsWith(`<img class="xj-platform-logo" src="../assets/images/logos/${name}"`));
      assert.match(match[2], /width="18" height="18" alt="" aria-hidden="true"/);
      const svg = fs.readFileSync(path.join(root, 'assets/images/logos', name), 'utf8');
      assert.match(svg, /<svg\b[^>]*viewBox=/);
      assert.doesNotMatch(svg, /<script|<image|<foreignObject|\bonload=/);
      count++;
    }
  }
  assert.equal(count, 10);
  assert.match(css, /\.xj-platform-logo \{[^}]*width: 18px; height: 18px; flex: 0 0 18px/);
});

function fixture(hash = '', withEmbed = false, withFutureEpisode = false) {
  const element = dataset => ({dataset, hidden: false, attributes: {}, listeners: {}, style: {},
    getBoundingClientRect() { return {width: this.width || 800}; },
    setAttribute(key, value) { this.attributes[key] = value; },
    getAttribute(key) { return this.attributes[key] || null; },
    removeAttribute(key) { delete this.attributes[key]; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    focus() { this.focused = true; },
    scrollIntoView() { this.scrolled = true; },
    append(child) { this.child = child; },
    remove() { this.removed = true; }
  });
  const keys = ['episode-1', 'trailer', ...(withFutureEpisode ? ['episode-2'] : [])];
  const panels = keys.map(key => element({episodePanel: key}));
  const platforms = keys.map(key => element({episodePlatforms: key}));
  const choices = keys.map(key => element({episodeSelect: key}));
  const video = {pauseCalls: 0, pause() { this.pauseCalls++; }};
  const episodeNodes = {};
  panels.forEach(panel => {
    const key = panel.dataset.episodePanel;
    const nodes = Object.fromEntries(['[data-episode-embed]', '[data-episode-mount]', '.xj-episode-cover', '[data-episode-help]', '[data-episode-status]', '[data-episode-source]', '[data-episode-reload]'].map(selector => [selector, element({})]));
    nodes['[data-episode-embed]'].dataset.embedSrc = `https://open.douyin.com/player/video?vid=${key === 'episode-1' ? '7691998330158599459' : 'future-test-video'}&autoplay=1&mode=pc`;
    panel.setAttribute('aria-label', key === 'episode-1' ? '《玄天诀》第一集：初入仙界' : '《玄天诀》第二集');
    panel.querySelector = selector => withEmbed && key !== 'trailer' ? nodes[selector] : null;
    panel.querySelectorAll = selector => selector === '[data-episode-play]' ? [nodes['.xj-episode-cover']] : [];
    episodeNodes[key] = nodes;
  });
  const embedNodes = episodeNodes['episode-1'];
  const section = {
    querySelector: selector => selector === 'video' ? video : null,
    querySelectorAll: selector => ({'[data-episode-panel]': panels, '[data-episode-platforms]': platforms, '[data-episode-select]': choices})[selector]
  };
  const window = element({});
  window.location = {hash};
  window.history = {replaceState(_state, _title, next) { window.location.hash = next; }};
  const timers = new Map();
  let timerID = 0;
  window.setTimeout = fn => { timers.set(++timerID, fn); return timerID; };
  window.clearTimeout = id => timers.delete(id);
  const frames = [];
  const document = { ...element({}), querySelector: () => section, createElement(tag) {
    assert.equal(tag, 'iframe');
    const frame = element({});
    frames.push(frame);
    return frame;
  }};
  vm.runInNewContext(script, {document, window});
  const click = (index, extra = {}) => {
    const event = {button: 0, prevented: false, preventDefault() { this.prevented = true; }, ...extra};
    choices[index].listeners.click(event);
    return event;
  };
  const playAt = (key, extra = {}) => episodeNodes[key]['.xj-episode-cover'].listeners.click({button: 0, preventDefault() {}, ...extra});
  const play = (extra = {}) => playAt('episode-1', extra);
  return {panels, platforms, choices, video, window, document, click, play, playAt, embedNodes, episodeNodes, frames, timers};
}

test('episodes expand on the first play request and keep the cinema size through recovery', () => {
  const f = fixture('', true);
  const embed = f.embedNodes['[data-episode-embed]'];
  assert.equal(embed.dataset.screenExpanded, undefined, 'compact poster before play');
  f.play({ctrlKey: true});
  assert.equal(embed.dataset.screenExpanded, undefined, 'external modified click does not expand');
  f.play();
  assert.equal(embed.dataset.screenExpanded, 'true', 'expands before iframe load, like the trailer');
  assert.equal(embed.dataset.playerState, undefined, 'expansion is not a claim of cross-origin playback');
  f.frames[0].listeners.load();
  assert.equal(embed.dataset.screenExpanded, 'true');
  f.embedNodes['[data-episode-reload]'].listeners.click();
  assert.equal(embed.dataset.screenExpanded, 'true', 'retry does not shrink the cinema');
  f.click(1);
  assert.equal(f.panels[0].hidden, true);
  f.click(0);
  assert.equal(embed.dataset.screenExpanded, 'true', 'return/replay retains the same size as the trailer');
});

test('future published episode panels inherit expansion and own their playback state', () => {
  const f = fixture('#episode-2', true, true);
  const first = f.embedNodes['[data-episode-embed]'];
  const second = f.episodeNodes['episode-2']['[data-episode-embed]'];
  assert.equal(f.panels[2].hidden, false, 'future episode deep links resolve');
  f.playAt('episode-2');
  assert.equal(second.dataset.screenExpanded, 'true');
  assert.equal(first.dataset.screenExpanded, undefined);
  assert.match(f.frames[0].title, /第二集/);
  assert.match(f.frames[0].src, /future-test-video/);
  assert.equal(f.window.location.hash, '#episode-2');
  f.click(0);
  assert.equal(f.frames[0].removed, true, 'switching episodes stops hidden playback');
  f.play();
  assert.equal(first.dataset.screenExpanded, 'true');
  assert.equal(f.panels[2].hidden, true);
  assert.equal(f.platforms[0].hidden, false);
  assert.equal(f.platforms[2].hidden, true);
  assert.equal(f.frames.length, 2);
  f.window.listeners.pagehide();
  assert.equal(f.frames[1].removed, true);
  assert.equal(f.timers.size, 0);
});

test('episode expansion uses the existing responsive cinema motion and respects reduced motion', () => {
  const embedCSS = fs.readFileSync(path.join(root, 'assets/xuantian-episode-player.css'), 'utf8');
  assert.match(embedCSS, /transition: box-shadow var\(--xj-screen-duration\) var\(--xj-screen-ease\)/);
  assert.match(embedCSS, /\.xj-episode-embed\[data-screen-expanded="true"\] \{ box-shadow: 0 0 80px 24px/);
  assert.match(embedCSS, /@media \(max-width: 700px\)[\s\S]*data-screen-expanded="true"/);
  assert.match(embedCSS, /@media \(prefers-reduced-motion: reduce\) \{\s*\.xj-episode-embed \{ transition: none;/);
  assert.match(css, /\.xj-viewing__cinema:has\(\.xj-screening:not\(\[hidden\]\) \[data-screen-expanded="true"\]\)/);
  assert.match(css, /\.xj-viewing__stage:has\(\.xj-screening:not\(\[hidden\]\) \[data-screen-expanded="true"\]\) \.xj-viewing__backdrop::before/);
});

test('onsite playback is lazy, accessible, and repeated play keeps the existing stream', () => {
  const f = fixture('', true);
  assert.equal(f.frames.length, 0, 'no third-party player before user action');
  assert.equal(f.embedNodes['[data-episode-source]'].textContent, '站内播放');
  assert.match(f.embedNodes['.xj-episode-cover'].attributes['aria-label'], /本站播放.*第一集.*抖音视频源/);
  f.play({ctrlKey: true});
  assert.equal(f.frames.length, 0);
  f.play();
  assert.equal(f.frames.length, 1);
  assert.match(f.frames[0].src, /open\.douyin\.com\/player\/video\?vid=7691998330158599459/);
  assert.match(f.frames[0].title, /第一集 · 初入仙界/);
  assert.match(f.frames[0].allow, /fullscreen/);
  assert.equal(f.frames[0].allowFullscreen, true);
  assert.equal(f.frames[0].focused, true);
  assert.equal(f.panels[0].scrolled, true);
  assert.equal(f.embedNodes['.xj-episode-cover'].hidden, true);
  assert.equal(f.embedNodes['[data-episode-mount]'].hidden, false);
  assert.equal(f.embedNodes['[data-episode-help]'].hidden, false);
  f.play();
  assert.equal(f.frames.length, 1);
});

test('switching to trailer unloads the cross-origin stream and stale load events do nothing', () => {
  const f = fixture('', true);
  f.play();
  const old = f.frames[0];
  f.click(1);
  assert.equal(old.removed, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.embedNodes['.xj-episode-cover'].hidden, false);
  assert.equal(f.embedNodes['[data-episode-mount]'].hidden, true);
  old.listeners.load();
  assert.equal(f.timers.size, 0);
  f.click(0);
  assert.equal(f.frames.length, 1, 'returning to the episode does not autoplay');
  f.play();
  assert.equal(f.frames.length, 2);
  f.window.listeners.pagehide();
  assert.equal(f.frames[1].removed, true);
});

test('slow embeds have recovery, reload resets the frame, and load is not reported as playing', () => {
  const f = fixture('', true);
  f.play();
  [...f.timers.values()][0]();
  assert.match(f.embedNodes['[data-episode-status]'].textContent, /加载较慢/);
  f.embedNodes['[data-episode-reload]'].listeners.click();
  assert.equal(f.frames[0].removed, true);
  assert.equal(f.frames.length, 2);
  f.frames[1].listeners.load();
  assert.equal(f.timers.size, 0);
  assert.match(f.embedNodes['[data-episode-status]'].textContent, /未自动播放/);
  assert.doesNotMatch(f.embedNodes['[data-episode-status]'].textContent, /正在播放/);
});

test('landscape embed reserves the official control strip without scaling or cropping', () => {
  const embedCSS = fs.readFileSync(path.join(root, 'assets/xuantian-episode-player.css'), 'utf8');
  assert.match(embedCSS, /\.xj-episode-embed__mount \{[^}]*aspect-ratio: 16 \/ 9;[^}]*padding-bottom: 35px;[^}]*box-sizing: content-box/);
  assert.match(embedCSS, /\.xj-episode-embed iframe \{[^}]*width: 100%; height: 100%/);
  assert.doesNotMatch(embedCSS, /scale\(/);
});

test('calendar and closing links reveal their target before native fragment scrolling', () => {
  const f = fixture('#trailer');
  const event = {button: 0, target: {closest: () => ({getAttribute: () => '#episode-1'})}};
  f.document.listeners.click({...event, ctrlKey: true});
  assert.equal(f.panels[0].hidden, true);
  f.document.listeners.click({...event, defaultPrevented: true});
  assert.equal(f.panels[0].hidden, true);
  f.document.listeners.click(event);
  assert.equal(f.panels[0].hidden, false);
  assert.equal(f.panels[1].hidden, true);
  assert.equal(f.window.location.hash, '#trailer', 'the browser still owns native anchor navigation');
});

test('episode selection synchronizes screen, platform links, current state and URL', () => {
  const f = fixture();
  assert.equal(f.panels[0].hidden, false);
  assert.equal(f.panels[1].hidden, true);
  assert.equal(f.choices[0].attributes['aria-current'], 'true');
  f.click(1);
  assert.equal(f.panels[0].hidden, true);
  assert.equal(f.panels[1].hidden, false);
  assert.equal(f.platforms[0].hidden, true);
  assert.equal(f.platforms[1].hidden, false);
  assert.equal(f.choices[0].attributes['aria-current'], undefined);
  assert.equal(f.choices[1].attributes['aria-current'], 'true');
  assert.equal(f.window.location.hash, '#trailer');
  f.click(0);
  assert.equal(f.video.pauseCalls, 2, 'initial cover and return both pause hidden video');
  assert.equal(f.panels[0].hidden, false);
  assert.equal(f.platforms[1].hidden, true);
});

test('deep links, hash navigation, modified clicks and blocked file history remain safe', () => {
  const f = fixture('#trailer');
  assert.equal(f.panels[1].hidden, false);
  assert.equal(f.video.pauseCalls, 0);
  assert.equal(f.click(0, {ctrlKey: true}).prevented, false);
  assert.equal(f.panels[1].hidden, false);
  f.window.location.hash = '#episode-1';
  f.window.listeners.hashchange();
  assert.equal(f.panels[0].hidden, false);
  f.window.location.hash = '#worldbuilding';
  f.window.listeners.hashchange();
  assert.equal(f.panels[0].hidden, false);
  f.window.history.replaceState = () => { throw Error('blocked'); };
  assert.doesNotThrow(() => f.click(1));
  assert.equal(f.panels[1].hidden, false);
});
