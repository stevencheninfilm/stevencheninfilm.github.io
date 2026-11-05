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
  const media = html => [...html.matchAll(/(?:data-src|data-src-mobile|data-src-hd|poster|data-poster)="([^"]+)"/g)].map(match => match[1]);
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
  assert.doesNotMatch(chinese, /class="detail-copy__english"[^>]*>3D Camera Previs to AI Video/);
  assert.match(english, /class="detail-copy__english"[^>]*>3D Camera Previs to AI Video/);
  assert.match(chinese, /comparison-project-link" href="\/zh\/ai\/index.html#dlss-detail">[^]*?<h1>重塑每一处细节<\/h1>/);
  assert.match(english, /comparison-project-link" href="\/en\/ai\/index.html#dlss-detail">[^]*?<h1>Redefine every detail\.<\/h1>/);
  assert.doesNotMatch(english, /data-(?:video|player)-lang="zh"/);
  for (const html of [english, chinese]) {
    assert.match(html, /data-site-language="zh"/);
    assert.match(html, /data-site-language="en"/);
    const nav = html.match(/<nav class="primary-nav"[^>]*>([^]*?)<\/nav>/)[1];
    assert.match(nav, /href="\.\.\/projects\/cat-nest.html"[^>]*>Vibe Coding<\/a>/);
    const locale = html.includes('<html lang="zh-Hans">') ? 'zh' : 'en';
    assert.ok(nav.includes(`href="/${locale}/ai/index.html"`));
    const avocadoEntry = `href="/${locale}/avocado-ai/index.html">${locale === 'zh' ? '抖音AI创作' : 'YueVisuals'}</a>`;
    assert.ok(nav.includes(avocadoEntry), 'localized Avocado AI entry is present');
    assert.ok(nav.indexOf(`href="/${locale}/ai/index.html"`) < nav.indexOf(avocadoEntry));
    assert.ok(nav.indexOf(avocadoEntry) < nav.indexOf('href="../film/Film.html"'));
    assert.match(nav, /href="\.\.\/film\/Film.html"/);
    assert.doesNotMatch(nav, /home-project-jump|data-home-replay|is-active/);
  }
});

test('published language routes match their independent source templates', () => {
  for (const [file, language] of Object.entries(OUTPUTS)) assert.equal(read(file), renderPage(file, language), file);
  assert.equal(read('index.html'), read('index-v3.html'));
});

test('HD upgrades resolve from every language route and comparison sides share one transaction', () => {
  for (const file of Object.keys(OUTPUTS)) {
    const html = read(file);
    const sources = [...html.matchAll(/data-src-hd="([^"]+)"/g)].map(match => match[1]);
    assert.equal(sources.length, 5, file);
    for (const source of sources) {
      if (file.includes('/')) assert.ok(source.startsWith('../assets/'), `${file}: ${source}`);
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), source)), `${file}: ${source}`);
    }
    assert.equal((html.match(/data-comparison data-progressive-group/g) || []).length, 2, file);
    assert.equal((html.match(/data-progressive-status/g) || []).length, 3, file);
    assert.doesNotMatch(html, /detail-quality-link|View 4K enhanced|查看 4K 增强版/);
    assert.ok(html.indexOf('assets/progressive-video.js') < html.indexOf('assets/progressive-video-status.js'), file);
    assert.ok(html.indexOf('assets/progressive-video.js') < html.indexOf('assets/banner-v3.js'), file);
  }
});
