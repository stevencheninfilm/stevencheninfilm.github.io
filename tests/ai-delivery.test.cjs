const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUT, SOURCES, renderBundle } = require('../tools/build-ai-css.cjs');
const { OUTPUTS } = require('../tools/build-ai-pages.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('AI routes load one current stylesheet without changing CSS asset resolution', () => {
  assert.equal(read(OUTPUT), renderBundle());
  assert.equal(new Set(SOURCES).size, SOURCES.length);
  for (const source of SOURCES) {
    assert.equal(path.dirname(source), path.dirname(OUTPUT));
    assert.ok(read(OUTPUT).includes(`/* Source: ${source} */\n${read(source).trimEnd()}`));
  }
  for (const file of Object.keys(OUTPUTS)) {
    const sheets = [...read(file).matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)];
    assert.equal(sheets.length, 1, file);
    assert.match(sheets[0][0], /ai-critical\.bundle\.css\?v=/);
  }
});

test('responsive image candidates resolve on all AI routes and reserve their aspect ratios', () => {
  for (const file of Object.keys(OUTPUTS)) {
    const tags = [...read(file).matchAll(/<img\b[^>]*srcset="[^"]+"[^>]*>/g)].map(m => m[0]);
    assert.ok(tags.length >= 9, file);
    for (const tag of tags) {
      assert.match(tag, /width="\d+" height="\d+"/);
      assert.match(tag, /loading="lazy"/);
      const candidates = tag.match(/srcset="([^"]+)"/)[1].split(',');
      for (const candidate of candidates) {
        const [url, descriptor] = candidate.trim().split(/\s+/);
        assert.match(descriptor, /^\d+w$/);
        const target = path.resolve(root, path.dirname(file), url);
        assert.ok(fs.existsSync(target), `${file}: ${url}`);
      }
    }
    assert.match(read(file), /href="[^"\s]*news\/ai-on-the-lot-2026\.png"/);
    assert.match(read(file), /href="[^"\s]*news\/future-reality-jury-fuller-hair-2026\.png"/);
  }
});

test('English film entry actions are localized before JavaScript and hero routes stay native', () => {
  const en = read('en/ai/index.html');
  assert.equal((en.match(/data-film-player lang="en"/g) || []).length, 2);
  assert.equal((en.match(/data-film-play hidden>Play film<\/button>/g) || []).length, 2);
  assert.doesNotMatch(en, /播放正片|直接打开视频|完整影片/);
  for (const file of Object.keys(OUTPUTS)) {
    const nav = read(file).match(/<nav class="ai-cinema-banner__index"[^>]*>([^]*?)<\/nav>/)[1];
    for (const id of ['dlss-detail', 'camera-previs-to-ai', 'real-cinema-to-ai']) {
      assert.ok(nav.includes(`href="#${id}"`));
    }
  }
});
