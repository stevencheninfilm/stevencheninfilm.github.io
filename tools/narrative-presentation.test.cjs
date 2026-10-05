const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'projects/xuantian-jie.html'), 'utf8');
const section = id => html.split(`<section id="${id}"`)[1].split('</section>')[0];

test('all original chapter anchors are unique and retain their narrative order', () => {
  let previous = -1;
  for (const id of ['recognition', 'full-film', 'the-project', 'worldbuilding', 'atlas', 'breakdown', 'role']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
    const index = html.indexOf(`id="${id}"`);
    assert.ok(index > previous);
    previous = index;
    assert.match(section(id), /aria-labelledby="[^"]+"/);
  }
});

test('world sequence moves from establishing view to detail, threshold, and full-width climax', () => {
  const world = section('worldbuilding');
  let previous = -1;
  for (const cue of ['xj-panorama ', 'xj-location--portrait ', 'tianheng-platform.jpg', 'xj-world-quote', 'xj-tianyan-entry', 'tianyan-portal.jpg', 'xj-location--climax ', 'tianyan-celestial-palace.jpg']) {
    const index = world.indexOf(cue);
    assert.ok(index > previous, cue);
    previous = index;
  }
  for (const file of ['xuantian-sect-overview.jpg', 'xuantian-hall-plaza.jpg', 'tianheng-platform.jpg', 'tianyan-portal.jpg', 'tianyan-celestial-palace.jpg']) {
    assert.equal(world.split(file).length - 1, 1, file);
  }
});

test('editorial images use existing local assets, explicit dimensions, lazy loading and meaningful alternatives', () => {
  for (const id of ['worldbuilding', 'atlas', 'breakdown']) {
    for (const image of section(id).matchAll(/<img\b[^>]+>/g)) {
      const tag = image[0];
      assert.match(tag, /width="\d+" height="\d+"/);
      assert.match(tag, /loading="lazy"/);
      assert.match(tag, /alt="[^"]+"/);
      const src = tag.match(/src="([^"]+)"/)[1];
      assert.ok(fs.existsSync(path.resolve(root, 'projects', src)), src);
    }
  }
});

test('English production notes remain available through a keyboard-operable native disclosure', () => {
  const method = section('breakdown');
  assert.match(method, /<details class="xj-language-note">\s*<summary lang="en">English version/);
  assert.doesNotMatch(method, /<details[^>]*\bopen\b/);
  assert.match(method, /Beginning with the promise of an idealized immortal realm/);
  assert.match(method, /I developed the project from story and worldbuilding/);
  assert.match(method, /能够维持角色、空间和视觉连续性/);
});

test('all eleven bilingual credits remain present and in order', () => {
  const credits = [...section('role').matchAll(/<li><span>(\d+)<\/span><div>([\s\S]*?)<\/div><\/li>/g)];
  assert.equal(credits.length, 11);
  credits.forEach((credit, index) => {
    assert.equal(Number(credit[1]), index + 1);
    assert.match(credit[2], /<small lang="en">[^<]+<\/small>/);
  });
});

test('the atlas retains in-page accessible zoom alongside the separate interactive atlas', () => {
  const atlas = section('atlas');
  assert.match(atlas, /class="xj-atlas__viewport" tabindex="0" role="group"/);
  assert.match(atlas, /aria-describedby="atlas-hint"/);
  const map = atlas.split('<figure class="xj-atlas__map')[1].split('</figure>')[0];
  assert.doesNotMatch(map, /<a\b|view full size/i);
  assert.match(atlas, /href="xuantian-map\/"/);
  assert.ok(fs.existsSync(path.join(root, 'projects/xuantian-map/index.html')));
});
