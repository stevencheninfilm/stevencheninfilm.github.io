const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUTS, renderPage } = require('../tools/build-avocado-pages.cjs');
const root = path.resolve(__dirname, '..');

test('every YueVisuals route is current and all local links resolve', () => {
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(html, renderPage(file, language));
    for (const match of html.matchAll(/\b(?:href|src|poster|data-src|data-src-hd|data-hover-src)="([^"]+)"/g)) {
      const value = match[1].replace(/&amp;/g, '&');
      if (/^(?:https?:|mailto:|#)/.test(value)) continue;
      const target = new URL(value, `https://example.test/${file}`);
      assert.ok(fs.existsSync(path.join(root, target.pathname)), `${file}: ${value}`);
    }
  }
});

test('initial page load attaches no movie or hover sources', () => {
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = renderPage(file, language);
    const videos = [...html.matchAll(/<video\b[^>]*>/g)].map(match => match[0]);
    assert.equal(videos.length, 4);
    for (const video of videos) {
      assert.doesNotMatch(video, /\ssrc=/, `${file} must keep video requests behind interaction`);
      assert.match(video, /preload="none"/);
      assert.match(video, /\bmuted\b/);
      assert.match(video, /\bplaysinline\b/);
    }
    assert.doesNotMatch(html, /<iframe\b/);
  }
});

test('two complete films have separate HD sources and accessible viewer controls', () => {
  const html = renderPage('zh/avocado-ai/index.html', 'zh');
  assert.equal((html.match(/data-src-hd=/g) || []).length, 2);
  assert.equal((html.match(/data-player-seek/g) || []).length, 2);
  assert.equal((html.match(/data-progressive-status/g) || []).length, 2);
  assert.match(html, /<dialog[^>]*aria-labelledby="cinema-title"/);
  assert.match(html, /data-cinema-close aria-label="关闭影院"/);
  assert.match(html, /data-rail-next aria-label="下一支"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /非官方 AI 概念预告/);
  assert.match(html, /485\.4万/);
  assert.match(html, /43\.1万/);
  assert.doesNotMatch(html, /513\.7万|514\.09万/);
});

test('all assets use web formats and remain below the runtime HD limit', () => {
  const dir = path.join(root, 'assets/videos/avocado-ai');
  for (const file of fs.readdirSync(dir)) {
    assert.match(file, /\.mp4$/);
    assert.ok(fs.statSync(path.join(dir, file)).size < 64 * 1024 * 1024, file);
  }
  assert.equal(fs.readdirSync(dir).length, 6);
});
