const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('film/film.js');
const context = vm.createContext({});
vm.runInContext(source.split("const grid = document.querySelector")[0], context);
const projects = vm.runInContext('projects', context);
const lossless = vm.runInContext('losslessWebpStills', context);

test('homepage has the requested seven entries, synchronized with v3', () => {
  const html = read('index.html');
  assert.equal(html, read('index-v3.html'));
  const cards = [...html.matchAll(/<article class="deck-card[^>]*data-title="([^"]+)" data-page="(\d+)"/g)];
  assert.deepEqual(cards.map(match => match[1]), ['Grand Theft Art', '玄天诀 / XUANTIAN JUE', 'Cybertruck: Mars', 'Feel Every Stories', 'Healing Wings', 'Alone', 'TVC']);
  assert.deepEqual(cards.map(match => match[2]), ['0','1','2','3','4','5','6']);
  assert.equal((html.match(/data-slide="/g) || []).length, 7);
  assert.match(html, /影视级AI剧集/);
  assert.match(html, /alone-poster-20260925.webp/);
  assert.match(html, /film\/Film.html#healing/);
  assert.match(html, /film\/Film.html#alone/);
});

test('film directing credits use Director in cards and project details', () => {
  for (const id of ['alone', 'everylook', 'power', 'cube', 'invert']) {
    const role = projects.find(project => project.id === id).role;
    assert.ok(role.split(' / ').includes('Director'), id);
    assert.ok(!role.includes('Direction'), id);
  }
  assert.equal(projects.find(project => project.id === 'ge').role, 'Assistant Direction / On-set Editing');
});

test('archive separates nine films and four complete commercial cases', () => {
  assert.equal(projects.filter(p => !p.collection).length, 9);
  const tvc = projects.filter(p => p.collection === 'tvc');
  assert.equal(tvc.length, 4);
  assert.deepEqual(Array.from(tvc, p => p.count), [6,5,6,4]);
  assert.equal(new Set(projects.map(p => p.id)).size, projects.length);
  assert.equal(projects.find(p => p.id === 'tumbleweed').role, 'Editing / Color Grading');
  for (const project of projects) {
    assert.ok(project.description && project.descriptionZh && project.role && project.date);
    for (let i = 1; i <= project.count; i++) {
      const stem = `${project.prefix}_img_${i}`;
      const file = project.collection === 'tvc'
        ? `assets/images/tvc/${project.id}-${String(i).padStart(2, '0')}.webp`
        : `film/images/${stem}.${lossless.has(stem) ? 'webp' : 'png'}`;
      assert.ok(fs.existsSync(path.join(root, file)), file);
    }
  }
});

test('Alone poster exposes one accessible recognition link tied to its artwork', () => {
  const html = read('index.html');
  const card = html.match(/<article class="deck-card deck-card--alone"[\s\S]*?<\/article>/)[0];
  assert.match(card, /class="alone-poster-frame"/);
  assert.equal((card.match(/<a\s/g) || []).length, 1);
  assert.match(card, /class="deck-project-link alone-recognition-link" href="film\/Film.html#alone" aria-label="Alone — View film recognition"/);
  assert.match(card, />View film recognition<\/span>/);
  const css = read('assets/portfolio.css');
  assert.match(css, /\.alone-recognition-label\s*\{[^}]*position:\s*absolute;[^}]*top:\s*100%;/);
  assert.match(css, /:is\(:hover, :focus-visible\)/);
  assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('TVC uses the selected banner without repeating its embedded title', () => {
  const card = read('index.html').match(/<article class="deck-card deck-card--tvc"[\s\S]*?<\/article>/)[0];
  assert.match(card, /class="tvc-home-layout"/);
  assert.doesNotMatch(card, /class="deck-project-title"/);
  assert.ok(card.indexOf('class="deck-picture tvc-image-link"') < card.indexOf('class="deck-project-link deck-project-link--meta"'));
  assert.match(card, /href="tvc\/index.html"/);
  assert.match(card, /banner-editorial-20260925.webp" width="2114" height="744"/);
  assert.match(card, /aria-label="TVC — Explore selected commercial work"/);
  assert.match(read('index.html'), /banner-editorial-thumb-20260925.webp" width="512" height="180"/);
  assert.match(read('tvc/index.html'), /class="tvc-banner"[^]*banner-editorial-20260925.webp/);
});

test('TVC image links navigate when expanded and preserve overview selection', () => {
  for (const page of ['index.html', 'index-v3.html']) {
    const card = read(page).match(/<article class="deck-card deck-card--tvc"[\s\S]*?<\/article>/)[0];
    assert.match(card, /<a class="deck-picture tvc-image-link" href="tvc\/index.html" aria-label="TVC — View commercial films" tabindex="-1">\s*<img[^>]+banner-editorial-20260925.webp[^>]+>\s*<\/a>/);
    assert.equal((card.match(/href="tvc\/index.html"/g) || []).length, 2);
  }
  const controller = read('assets/site.js');
  assert.ok(controller.includes("querySelectorAll('.deck-project-link, .tvc-image-link')"));
  assert.match(controller, /projectLinks\.forEach\(\(projectLink\) => \{\s*projectLink.tabIndex = mode === 'expanded' && selected \? 0 : -1;/);
  assert.match(read('assets/portfolio.css'), /\.project-deck\.is-strip \.tvc-image-link \{ pointer-events: none; \}/);
});

test('TVC brand artwork follows the projects and precedes production services', () => {
  const html = read('tvc/index.html');
  const projectsEnd = html.indexOf('</section>', html.indexOf('id="commercials"'));
  const brands = html.indexOf('<figure class="tvc-brand-portfolio">');
  const services = html.indexOf('<section class="tvc-services">');
  assert.ok(projectsEnd >= 0 && projectsEnd < brands && brands < services);
  assert.equal((html.match(/src="\.\.\/assets\/images\/tvc\/brands\.webp"/g) || []).length, 1);
  assert.match(html, /brands.webp" width="1366" height="480" loading="lazy"/);
  assert.match(html, /class="tvc-banner"/);
});

test('TVC cards use the selected gallery stills as preview images', () => {
  for (const [id, number] of [['wuhan', '05'], ['rene', '04'], ['ge', '02']]) {
    const project = projects.find(item => item.id === id);
    assert.equal(project.preview, `../assets/images/tvc/${id}-${number}.webp`);
    assert.ok(fs.existsSync(path.resolve(root, 'tvc', project.preview)));
    assert.ok(project.count >= Number(number));
  }
  assert.equal(projects.find(item => item.id === 'feihe').preview, undefined);
});

test('all edited entry pages resolve local assets and include TVC navigation', () => {
  for (const file of ['index.html','index-v3.html','about.html','ai/index.html','film/Film.html','tvc/index.html']) {
    const html = read(file);
    assert.match(html, /tvc\/index.html|aria-current="page" href="index.html">TVC/);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, `duplicate id in ${file}`);
    for (const match of html.matchAll(/\s(?:src|href|poster|data-src)="([^"]+)"/g)) {
      const value = match[1].split(/[?#]/)[0];
      if (!value || /^(?:https?:|mailto:|tel:|data:)/.test(value)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), value)), `${file}: ${value}`);
    }
  }
});
