#!/usr/bin/env node
'use strict';

// About copy is independent by language; assets and collaboration facts are shared.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://stevencheninfilm.com';
const OUTPUTS = { 'about.html': 'en', 'about-v3.html': 'en', 'en/about.html': 'en', 'zh/about.html': 'zh' };
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function renderPage(file, language, root = ROOT) {
  let html = fs.readFileSync(path.join(root, `locales/about.${language}.html`), 'utf8');
  const partners = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/industry-partnerships.json'), 'utf8'));
  const list = partners.map(partner => {
    const secondary = partner.secondaryName[language];
    const name = `${escape(partner.name[language])}${secondary && partner.id !== 'moodio' ? ` <span>${escape(secondary)}</span>` : ''}`;
    const detail = `${partner.id === 'moodio' && secondary ? `<span>${escape(secondary)}</span>` : ''}<span class="ab-partner-detail">${escape(partner.detail[language])}</span>`;
    return `<div data-partnership="${escape(partner.id)}"><dt>${name}</dt><dd>${escape(partner.role[language])}${detail}</dd></div>`;
  }).join('\n            ');
  html = html.replace('<!-- industry-partner-list -->', list);
  const relativeUrl = value => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value)) return value;
    const target = new URL(value, `${ORIGIN}/about.html`);
    return `${path.posix.relative(path.posix.dirname(file), target.pathname.slice(1))}${target.search}${target.hash}`;
  };
  html = html.replace(/\b(href|src|poster|data-src|data-src-mobile|data-src-hd|data-poster)="([^"]+)"/g,
    (_, attribute, value) => `${attribute}="${relativeUrl(value)}"`);
  const seo = [
    `<link rel="canonical" href="${ORIGIN}/${language}/about.html">`,
    `<link rel="alternate" hreflang="en" href="${ORIGIN}/en/about.html">`,
    `<link rel="alternate" hreflang="zh-Hans" href="${ORIGIN}/zh/about.html">`,
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/about.html">`,
  ].join('\n  ');
  return html.replace('<!-- about-language-seo -->', seo);
}

function main() {
  const check = process.argv.includes('--check');
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = renderPage(file, language);
    const target = path.join(ROOT, file);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) throw new Error(`${file} is stale. Run node tools/build-about-pages.cjs`);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, html);
    }
  }
  console.log(`${check ? 'Verified' : 'Built'} ${Object.keys(OUTPUTS).length} About routes from two language templates.`);
}

if (require.main === module) main();
module.exports = { OUTPUTS, renderPage };
