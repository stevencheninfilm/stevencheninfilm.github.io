const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUTS, renderPage } = require('../tools/build-about-pages.cjs');
const root = path.resolve(__dirname, '..');
const partners = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/industry-partnerships.json'), 'utf8'));

test('all independent About routes are generated and link to existing localized pages and shared media', () => {
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = renderPage(file, language);
    assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), html, file);
    assert.match(html, new RegExp(`<html lang="${language === 'zh' ? 'zh-Hans' : 'en'}">`));
    assert.match(html, new RegExp(`rel="canonical" href="https://stevencheninfilm.com/${language}/about.html"`));
    for (const locale of ['en', 'zh-Hans', 'x-default']) assert.ok(html.includes(`hreflang="${locale}"`));
    assert.ok(html.includes(`href="/${language}/index.html"`));
    assert.ok(html.includes(`href="/${language}/ai/index.html"`));
    assert.ok(html.includes(`href="/${language}/avocado-ai/index.html"`));
    assert.match(html, /data-site-language="zh"/);
    assert.match(html, /data-site-language="en"/);
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
    for (const [, value] of html.matchAll(/\b(?:href|src|poster|data-src|data-src-mobile|data-src-hd)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|tel:)/.test(value)) continue;
      const url = new URL(value.replace(/&amp;/g, '&'), `https://example.test/${file}`);
      assert.ok(fs.existsSync(path.join(root, url.pathname)), `${file}: ${value}`);
      if (value.startsWith('#')) assert.ok(ids.has(value.slice(1)), `${file}: ${value}`);
    }
  }
});

test('Chinese About translates every chapter, navigation and comparison controls while preserving contact and film anchors', () => {
  const html = renderPage('zh/about.html', 'zh');
  for (const copy of ['关于与联系', '生成式AI艺术家', '创作背景', '创作实践', '行业合作', '作品荣誉', '聊聊创作合作', '左右拖动对比', '播放对比', '重试高清', '评审 / 2026']) assert.ok(html.includes(copy), copy);
  assert.doesNotMatch(html, /Skip to profile|Play comparison|Upcoming \/ Jury|What are we|Ways to collaborate/);
  for (const id of ['background', 'practice', 'collaborations', 'recognition', 'contact']) {
    assert.ok(html.includes(`id="${id}"`));
    assert.ok(html.includes(`href="#${id}"`));
  }
  assert.ok(html.includes('mailto:kieen1454@gmail.com'));
  assert.ok(html.includes('tel:+13475745244'));
  assert.ok(html.includes('tel:+8613774300777'));
  assert.match(html, /aria-label="拖动查看 3D 预演与 AI 渲染对比"/);
  assert.match(html, /aria-valuetext="50% 运镜预演，50% AI 画面"/);
});

test('About partnership identities and descriptions come from shared bilingual data', () => {
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = renderPage(file, language);
    const list = html.match(/<dl class="ab-partner-list">[^]*?<\/dl>/)[0];
    assert.deepEqual([...list.matchAll(/data-partnership="([^"]+)"/g)].map(m => m[1]), partners.map(partner => partner.id));
    for (const partner of partners) {
      assert.ok(list.includes(partner.name[language]), `${file}: ${partner.id}`);
      assert.ok(list.includes(partner.role[language].replace(/&/g, '&amp;')), `${file}: ${partner.id} role`);
      assert.ok(list.includes(partner.detail[language]), `${file}: ${partner.id} detail`);
    }
  }
});
