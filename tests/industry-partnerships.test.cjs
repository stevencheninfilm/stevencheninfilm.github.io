const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUTS, renderPage } = require('../tools/build-ai-pages.cjs');
const root = path.resolve(__dirname, '..');
const partners = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/industry-partnerships.json'), 'utf8'));
const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

test('all AI editions expose the five shared partnership identities as readable text', () => {
  assert.deepEqual(partners.map(partner => partner.id), ['dreamina', 'kling', 'shotlab', 'moodio', 'opencreator']);
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = renderPage(file, language);
    const section = html.match(/<section[^>]*id="industry-partnerships"[^>]*>([^]*?)<\/section>/)[1];
    const cards = [...section.matchAll(/<li\b[^>]*data-industry-partner="([^"]+)"[^>]*>([^]*?)<\/li>/g)];
    assert.deepEqual(cards.map(card => card[1]), partners.map(partner => partner.id), file);
    cards.forEach((card, index) => {
      const partner = partners[index];
      assert.ok(card[2].includes(`<h3>${escape(partner.name[language])}`), `${file}: ${partner.id} text heading`);
      assert.ok(card[2].includes(escape(partner.role[language])), `${file}: ${partner.id} shared role`);
      assert.ok(card[2].includes(escape(partner.detail[language])), `${file}: ${partner.id} shared description`);
    });
    const kling = cards.find(card => card[1] === 'kling')[2];
    assert.match(kling, language === 'zh' ? /官方精英创作者计划/ : /Elite Creators Program/);
    assert.doesNotMatch(kling, /Contracted|Ambassador|代言|签约/);
    assert.doesNotMatch(section, /industry-partnerships-20260925|industry-partnerships-zh-20261104|全部四项|all four/);
  }
});

test('partner marks resolve in nested routes without adding eager or full-size media', () => {
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const section = renderPage(file, language).match(/<section[^>]*id="industry-partnerships"[^>]*>([^]*?)<\/section>/)[1];
    const images = [...section.matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
    assert.equal(images.length, 5);
    for (const tag of images) {
      assert.match(tag, /alt=""/);
      assert.match(tag, /loading="lazy"/);
      assert.match(tag, /decoding="async"/);
      assert.match(tag, /width="\d+" height="\d+"/);
      const src = tag.match(/src="([^"]+)"/)[1];
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), src)), `${file}: ${src}`);
    }
    assert.match(section, /tabindex="0" aria-describedby="partnerships-scroll-hint"/);
  }
});
