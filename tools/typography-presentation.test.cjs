const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'projects/xuantian-jie.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/xuantian.css'), 'utf8');
const rule = selector => {
  const start = css.indexOf(selector + ' {');
  assert.notEqual(start, -1, selector);
  return css.slice(start, css.indexOf('}', start) + 1);
};

test('reading scale uses 18px desktop / 17px mobile body and 14px secondary English', () => {
  assert.match(css, /--xj-type-body: 1\.125rem/);
  assert.match(css, /--xj-type-body: 1\.0625rem/);
  assert.match(css, /--xj-type-note: \.875rem/);
  assert.match(css, /--xj-leading-body: 1\.9/);
  assert.match(rule('.xj-statement__copy p'), /font-size: var\(--xj-type-body\)/);
  assert.match(rule('.xj-breakdown__columns p'), /line-height: var\(--xj-leading-body\)/);
});

test('long reading passages and UI use the sans role; display face remains on the film title', () => {
  assert.match(css, /\.xj-hero h1 > span, \.xj-page \.xj-location-name \{ font-family: var\(--xj-serif\)/);
  assert.match(rule('.xj-breakdown__columns .xj-breakdown__lead'), /font-family: var\(--xj-sans\)/);
  assert.match(rule('.xj-world-quote'), /font-family: var\(--xj-sans\)/);
  assert.match(rule('.xj-viewing__live-copy p'), /font-family: var\(--xj-sans\)/);
  assert.doesNotMatch(css, /Georgia|fonts\.googleapis/);
});

test('Chinese reading measure uses em and punctuation-aware wrapping instead of break-all', () => {
  assert.match(css, /--xj-measure-zh: 34em/);
  assert.match(rule('.xj-statement__copy'), /max-width: var\(--xj-measure-zh\)/);
  assert.match(rule('.xj-breakdown__columns p'), /max-width: var\(--xj-measure-zh\)/);
  assert.match(rule('.xj-page p'), /line-break: strict; word-break: normal/);
  assert.doesNotMatch(css, /word-break:\s*break-all/);
});

test('semantic title groups preserve the approved Chinese wording', () => {
  for (const [id, text] of Object.entries({
    'viewing-title': '凡人飞升，才是仙途的开始。',
    'statement-title': '以凡人之身，踏入浩瀚仙途。',
    'world-title': '两种秩序，同一片天地。',
    'breakdown-title': '从单一画面，到完整电影叙事。',
    'role-title': '导演 / 创作者 /生成式艺术家'
  })) {
    const heading = html.match(new RegExp(`<h2 id="${id}"[^>]*>([\\s\\S]*?)</h2>`))[1];
    const chinese = heading.split('<small')[0].replace(/<[^>]+>/g, '');
    assert.equal(chinese, text);
    assert.match(heading, /class="xj-phrase"/);
  }
  assert.match(rule('.xj-title-line'), /display: block/);
  assert.match(rule('.xj-phrase'), /display: inline-block/);
});

test('heading English stays a secondary, regular-weight sans layer', () => {
  const english = rule('.xj-page .xj-heading-en');
  assert.match(english, /font-family: var\(--xj-sans\)/);
  assert.match(english, /font-size: var\(--xj-type-note\)/);
  assert.match(english, /font-weight: 400/);
  assert.match(english, /max-width: 48ch/);
});
