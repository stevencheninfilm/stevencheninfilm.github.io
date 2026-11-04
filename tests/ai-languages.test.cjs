const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUTS, renderPage } = require('../tools/build-ai-pages.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('AI language routes retain the same three workflows, lazy media and HD pairs', () => {
  const en = read('en/ai/index.html');
  const zh = read('zh/ai/index.html');
  const stories = html => [...html.matchAll(/data-workflow-item aria-labelledby="([^"]+)"/g)].map(m => m[1]);
  const media = html => [...html.matchAll(/(?:data-src|data-src-hd|data-src-mobile|poster)="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(stories(en), ['dlss-title', 'previs-title', 'cinema-title']);
  assert.deepEqual(stories(zh), stories(en));
  assert.deepEqual(media(zh), media(en));
  for (const html of [en, zh]) {
    assert.equal((html.match(/data-progressive-group/g) || []).length, 2);
    assert.equal((html.match(/data-src-hd=/g) || []).length, 8);
    assert.match(html, /href="https:\/\/stevencheninfilm.com\/zh\/ai\/index.html"/);
    assert.match(html, /data-site-language="en"/);
    assert.match(html, /data-site-language="zh"/);
    const videoTags = [...html.matchAll(/<video\b[^>]*>/g)].map(m => m[0]);
    for (const video of videoTags) {
      assert.match(video, /preload="none"/);
      assert.doesNotMatch(video, /\ssrc="/);
    }
  }
  assert.match(zh, /<html lang="zh-Hans"/);
  assert.match(zh, /重塑每一处细节/);
  assert.match(zh, /掌控镜头，<br><em>重构世界/);
  assert.match(zh, /实拍入镜，<br><em>AI 造境/);
  assert.match(zh, /data-video-loading data-video-lang="zh"/);
  assert.match(zh, /data-news-edition="Future Reality AI 电影节 — 电影节初审评委/);
});

test('AI generated pages resolve every local asset and keep the source templates current', () => {
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = read(file);
    assert.equal(html, renderPage(file, language), file);
    for (const match of html.matchAll(/(?:src|poster|data-src|data-src-hd|data-src-mobile|href)="([^"]+)"/g)) {
      const value = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(value)) continue;
      const filePath = value.split(/[?#]/)[0];
      const target = filePath.startsWith('/') ? path.join(root, filePath) : path.resolve(root, path.dirname(file), filePath);
      assert.ok(fs.existsSync(target), `${file}: ${value}`);
    }
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, `duplicate anchors in ${file}`);
  }
});
