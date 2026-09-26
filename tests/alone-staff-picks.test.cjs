const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const image = 'assets/images/projects/alone/alone-staff-picks-2023-3840.png';

test('ranking strip is a wide, high-resolution RGBA PNG', () => {
  const png = fs.readFileSync(path.join(root, image));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 3840);
  assert.equal(png.readUInt32BE(20), 320);
  assert.equal(png[25], 6);
  assert.ok(png.length < 150000);
});

test('small screens get a readable two-row variant with both labels', () => {
  const png = fs.readFileSync(path.join(root, 'assets/images/projects/alone/alone-staff-picks-2023-mobile.png'));
  assert.equal(png.readUInt32BE(16), 1920);
  assert.equal(png.readUInt32BE(20), 640);
  assert.equal(png[25], 6);
  for (const file of ['index.html', 'index-v3.html', 'film/film.js']) {
    assert.match(read(file), /<source media="\(max-width: 560px\)"/);
    assert.ok(read(file).includes('alone-staff-picks-2023-mobile.png'));
  }
});

test('build retains the original SVG and exact week labels, in screenshot order', () => {
  const build = read('tools/build-alone-staff-picks.cjs');
  assert.match(build, /rank-staff-picks\.11717261\.svg/);
  assert.match(build, /2023 · 第35期 · 精选周榜.*2023 · 第34期 · 精选周榜/);
  assert.ok(read('assets/images/projects/alone/rank-staff-picks.11717261.svg').includes('viewBox="0 0 24 24"'));
});

test('both homepage versions use the same strip inside Alone only', () => {
  for (const page of ['index.html', 'index-v3.html']) {
    const html = read(page);
    const section = html.match(/<article class="deck-card deck-card--alone"[\s\S]*?<\/article>/)[0];
    assert.ok(section.includes(image));
    assert.match(section, /class="alone-staff-picks alone-staff-picks--home"/);
    assert.equal(html.split(image).length - 1, 1);
    assert.match(section, /alt="新片场精选周榜：2023年第35期、2023年第34期/);
  }
});

test('detail badge is optional per project and resets with each new synopsis', () => {
  const source = read('film/film.js');
  assert.equal((source.match(/staffPicks: \{/g) || []).length, 1);
  assert.match(source, /dialogDescription\.innerHTML =[^\n]+\n  if \(project\.staffPicks\)/);
  assert.match(source, /escapeHTML\(project\.staffPicks\.alt\)/);
  const css = read('assets/portfolio.css');
  assert.match(css, /\.alone-staff-picks img \{[^}]*height: auto;[^}]*object-fit: contain;/);
  assert.match(css, /\.project-deck\.is-strip \.alone-staff-picks--home \{ display: none; \}/);
});

test('both placements are transparent and only image silhouettes cast a 10% shadow', () => {
  const css = read('assets/portfolio.css');
  const home = css.match(/\.alone-staff-picks--home \{[^}]+\}/)[0];
  const image = css.match(/\.alone-staff-picks img \{[^}]+\}/)[0];
  assert.match(home, /background: transparent;/);
  assert.match(image, /background: transparent;/);
  assert.match(image, /filter: drop-shadow\(0 2px 6px rgba\(0, 0, 0, \.1\)\);/);
  assert.doesNotMatch(home + image, /box-shadow:|opacity:/);
  for (const page of ['index.html', 'index-v3.html', 'film/Film.html']) {
    assert.match(read(page), /portfolio\.css\?v=20260925-[^"\s]+/);
  }
});
