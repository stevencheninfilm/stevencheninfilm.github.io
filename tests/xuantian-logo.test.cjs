const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const asset = 'assets/images/projects/xuantian-jie/xuantian-jue-logo.png';

test('supplied emblem retains its native dimensions and alpha channel', () => {
  const png = fs.readFileSync(path.join(root, asset));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1672);
  assert.equal(png.readUInt32BE(20), 941);
  assert.equal(png[25], 6, 'RGBA PNG, not flattened onto black');
});

test('project hero and closing use the emblem while navigation stays readable', () => {
  const html = read('projects/xuantian-jie.html');
  const h1 = html.match(/<h1 id="xj-title"[\s\S]*?<\/h1>/)[0];
  assert.match(h1, /class="xj-brand-art"[^>]+alt="玄天诀"/);
  assert.match(h1, /width="1672" height="941"/);
  assert.match(h1, /fetchpriority="high"/);
  assert.match(h1, /<small lang="en">XUANTIAN JUE<\/small>/);
  assert.match(html, /rel="preload"[^>]+xuantian-jue-logo\.png/);
  assert.match(html, /class="xj-brand-art xj-end__brand"/);
  const nav = html.match(/<header class="site-header[\s\S]*?<\/header>/)[0];
  assert.match(nav, /<span lang="zh-Hans">玄天诀<\/span>/);
  assert.doesNotMatch(nav, /xuantian-jue-logo/);
});

test('project identity is consistent on the two homepage entries and AI feature', () => {
  for (const file of ['index.html', 'index-v3.html', 'ai/index.html', 'projects/xuantian-jie.html']) {
    const html = read(file);
    assert.match(html, /xuantian-brand\.css\?v=20260927-logo-[123]/);
    assert.match(html, /xuantian-jue-logo\.png/);
    for (const match of html.matchAll(/<img[^>]+xuantian-jue-logo\.png[^>]+>/g)) {
      assert.match(match[0], /width="1672" height="941"/);
      assert.match(match[0], /alt="玄天诀/);
      const src = match[0].match(/src="([^"]+)"/)[1];
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), src)));
    }
  }
  assert.equal(read('index.html'), read('index-v3.html'));
  assert.match(read('ai/index.html'), /<h2 class="xj-feature-title"[\s\S]*?alt="玄天诀"[\s\S]*?<\/h2>/);
});

test('responsive brand styling preserves full artwork without cropping or recoloring', () => {
  const css = read('assets/xuantian-brand.css');
  const artwork = css.match(/\.xj-brand-art\s*\{([^}]+)\}/)[1];
  assert.match(artwork, /height: auto/);
  assert.match(artwork, /max-width: 100%/);
  assert.match(artwork, /object-fit: contain/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(max-height: 650px\)/);
  assert.doesNotMatch(css, /object-fit:\s*cover|grayscale|mix-blend-mode|hue-rotate/);
});

test('project emblem is compact and closing Chinese text is optically centered', () => {
  const css = read('assets/xuantian-brand.css');
  assert.match(css, /\.xj-page \.xj-hero__title \{ width: min\(400px, 38vw, 44svh\)/);
  assert.match(css, /width: min\(280px, 78%\)/);
  assert.match(css, /\.xj-page \.xj-end h2 \{[^}]*width: 100%;[^}]*text-align: center/);
  assert.match(css, /\.xj-end__period \{ position: absolute; left: 100%;/);
  const ending = read('projects/xuantian-jie.html').split('<section class="xj-end"')[1].split('</section>')[0];
  assert.match(ending, /class="xj-end__title-line"/);
  assert.match(ending, /class="xj-end__period">。<\/span>/);
  assert.match(ending, /走进<span class="xj-phrase">玄天世界/);
  assert.match(ending, /Enter the immortal realm\./);
});

test('homepage emblem is 25 percent smaller without shrinking the title typography', () => {
  const css = read('assets/xuantian-brand.css');
  assert.match(css, /\.home-page \.deck-project-title--xuantian \.xj-brand-art \{ width: 75%; \}/);
  assert.match(css, /\.home-page \.deck-project-title--xuantian \{ width: min\(560px, 58vw, 64svh\)/);
  assert.match(css, /\.home-page \.deck-project-title--xuantian small \{ font-size: clamp\(12px, 1\.1vw, 17px\)/);
  assert.match(read('assets/site.css'), /\.deck-project-title--xuantian\s*\{[^}]*align-items:\s*center/);
});
