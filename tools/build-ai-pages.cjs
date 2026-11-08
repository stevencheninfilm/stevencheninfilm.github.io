#!/usr/bin/env node
'use strict';

// AI templates are authored relative to /ai/; both locales share the same media.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://stevencheninfilm.com';
const OUTPUTS = {
  'ai/index.html': 'en',
  'en/ai/index.html': 'en',
  'zh/ai/index.html': 'zh',
};

function renderPage(file, language, root = ROOT) {
  let html = fs.readFileSync(path.join(root, `locales/ai.${language}.html`), 'utf8');
  const relativeUrl = value => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value)) return value;
    const target = new URL(value, `${ORIGIN}/ai/index.html`);
    const relative = path.posix.relative(path.posix.dirname(file), target.pathname.slice(1));
    return `${relative}${target.search}${target.hash}`;
  };
  html = html.replace(/\bsrcset="([^"]+)"/g, (_, value) =>
    `srcset="${value.split(',').map(candidate => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/);
      return [relativeUrl(url), ...descriptor].join(' ');
    }).join(', ')}"`);
  html = html.replace(/\b(href|src|poster|data-src|data-src-mobile|data-src-hd|data-poster|data-preview|data-poster-preview|data-link)="([^"]+)"/g,
    (match, attribute, value) => {
      return `${attribute}="${relativeUrl(value)}"`;
    });
  const seo = [
    `<link rel="canonical" href="${ORIGIN}/${language}/ai/index.html">`,
    `<link rel="alternate" hreflang="en" href="${ORIGIN}/en/ai/index.html">`,
    `<link rel="alternate" hreflang="zh-Hans" href="${ORIGIN}/zh/ai/index.html">`,
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}/ai/index.html">`,
  ].join('\n  ');
  html = html.replace('<!-- ai-language-seo -->', seo);
  return html;
}

function main() {
  const check = process.argv.includes('--check');
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = renderPage(file, language);
    const target = path.join(ROOT, file);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) {
        throw new Error(`${file} is stale. Run node tools/build-ai-pages.cjs`);
      }
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, html);
    }
  }
  console.log(`${check ? 'Verified' : 'Built'} ${Object.keys(OUTPUTS).length} AI routes from two language templates.`);
}

if (require.main === module) main();
module.exports = { OUTPUTS, renderPage };
