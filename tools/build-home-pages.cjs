#!/usr/bin/env node
'use strict';

// Author each language independently; keep media, routes and the legacy entry in sync.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const OUTPUTS = {
  'index.html': 'en',
  'index-v3.html': 'en',
  'en/index.html': 'en',
  'zh/index.html': 'zh',
};

function renderPage(file, language, root = ROOT) {
  let html = fs.readFileSync(path.join(root, `locales/home.${language}.html`), 'utf8');
  const nested = file.includes('/');
  if (nested) {
    const relativeUrl = value => /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value) ? value : `../${value}`;
    html = html.replace(/\b(srcset|data-srcset)="([^"]+)"/g,
      (_, attribute, value) => `${attribute}="${value.split(',').map(candidate => {
        const [url, ...descriptor] = candidate.trim().split(/\s+/);
        return [relativeUrl(url), ...descriptor].join(' ');
      }).join(', ')}"`);
    html = html.replace(/\b(href|src|poster|data-src|data-src-mobile|data-src-hd|data-poster|data-preview|data-poster-preview|data-link)="([^"]+)"/g,
      (match, attribute, value) => {
        return `${attribute}="${relativeUrl(value)}"`;
      });
    // Work replays this language's opening rather than returning to auto selection.
    html = html.replace('href="../index.html" data-home-replay', 'href="index.html" data-home-replay');
  }
  return html;
}

function main() {
  const check = process.argv.includes('--check');
  for (const [file, language] of Object.entries(OUTPUTS)) {
    const html = renderPage(file, language);
    const target = path.join(ROOT, file);
    if (check) {
      if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== html) {
        throw new Error(`${file} is stale. Run node tools/build-home-pages.cjs`);
      }
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, html);
    }
  }
  console.log(`${check ? 'Verified' : 'Built'} ${Object.keys(OUTPUTS).length} home routes from two language templates.`);
}

if (require.main === module) main();
module.exports = { OUTPUTS, renderPage };
