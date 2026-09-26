const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ai/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/portfolio.css'), 'utf8');
const feel = html.split('id="feel">')[1].split('</section>')[0];

test('Feel award appears after the introduction and directly before Role / Format', () => {
  assert.equal((html.match(/<figure class="project-award project-award--feel">/g) || []).length, 1);
  assert.match(feel, /感受每个故事。<\/p>\s*<figure class="project-award project-award--feel">/);
  assert.match(feel, /<\/figure>\s*<dl class="meta-list"><div><dt>Role<\/dt>/);
  assert.match(feel, /alt="2025 金雀奖 · 校园精英大赛 · 创作人最佳剪辑 · 二等奖"/);
});

test('award uses the selected original PNG and reserves its uncropped native ratio', () => {
  const src = feel.match(/<figure class="project-award project-award--feel">\s*<img src="([^"]+)"/)[1];
  const image = fs.readFileSync(path.resolve(root, 'ai', src));
  assert.equal(crypto.createHash('sha256').update(image).digest('hex'), '8fab8fd9bbf1caf644cb03593d8acd883b07747d32df3ca7de4846e3b9ffb23b');
  assert.equal(image.readUInt32BE(16), 1774);
  assert.equal(image.readUInt32BE(20), 887);
  assert.equal(image[25], 6, 'retain RGBA transparency');
  assert.match(feel, /width="1774" height="887" loading="lazy" decoding="async"/);
  assert.match(css, /\.project-award--feel\s*\{[^}]*width:\s*min\(100%, 320px\)/);
  assert.match(css, /\.project-award--feel img\s*\{[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/);
});
