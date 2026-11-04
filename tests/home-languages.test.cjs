const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUTS, renderPage } = require('../tools/build-home-pages.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('both home languages keep the same ten projects and responsive media', () => {
  const english = read('en/index.html');
  const chinese = read('zh/index.html');
  const media = html => [...html.matchAll(/(?:data-src|data-src-mobile|poster|data-poster)="([^"]+)"/g)].map(match => match[1]);
  const pages = html => [...html.matchAll(/data-page="(-?\d+)"/g)].map(match => match[1]);
  assert.deepEqual(pages(english), ['-1','0','1','2','3','4','5','6','7','8']);
  assert.deepEqual(pages(chinese), pages(english));
  assert.deepEqual(media(chinese), media(english));
  assert.match(chinese, /<html lang="zh-Hans">/);
  assert.match(english, /<html lang="en">/);
  assert.match(chinese, /掌控镜头，重构世界/);
  assert.match(chinese, /实拍入镜，AI 造境/);
  assert.match(english, /Direct the camera\.<br>Reinvent the world\./);
  assert.match(english, /Real Cinema<br>to AI Video/);
  assert.doesNotMatch(english, /data-(?:video|player)-lang="zh"/);
  for (const html of [english, chinese]) {
    assert.match(html, /data-site-language="zh"/);
    assert.match(html, /data-site-language="en"/);
    assert.match(html, /href="index.html" data-home-replay/);
  }
});

test('published language routes match their independent source templates', () => {
  for (const [file, language] of Object.entries(OUTPUTS)) assert.equal(read(file), renderPage(file, language), file);
  assert.equal(read('index.html'), read('index-v3.html'));
});
