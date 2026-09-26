const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('both homepage entries retain the original plain support credit', () => {
  for (const file of ['index.html', 'index-v3.html']) {
    const html = read(file);
    const card = html.split('data-title="玄天诀 / XUANTIAN JUE"')[1].split('</article>')[0];
    assert.doesNotMatch(html, /project-support/);
    assert.equal((card.match(/Support by/g) || []).length, 1);
    assert.ok(card.indexOf('project-tool-line') < card.indexOf('deck-project-title'));
    assert.match(card, /Support by/);
    assert.match(card, /Seedance 2\.5/);
    assert.match(card, /新片场<\/span> Shotlab/);
    assert.match(card, /project-tool-logo--dreamina/);
    assert.match(card, /project-tool-logo--xinpianchang/);
  }
  assert.equal(read('index.html'), read('index-v3.html'));
});

test('AI Visuals adds the support information only to Xuantian, matching other project tool rows', () => {
  const html = read('ai/index.html');
  const project = html.split('id="xuantian">')[1].split('</section>')[0];
  assert.equal((html.match(/Support by/g) || []).length, 1);
  assert.match(project, /class="project-tool-line project-tool-line--detail"/);
  assert.match(project, /Support by/);
  assert.match(project, /project-tool-logo--dreamina/);
  assert.match(project, /Seedance 2\.5/);
  assert.match(project, /project-tool-logo--xinpianchang/);
  assert.match(project, /新片场<\/span> Shotlab/);
  assert.ok(project.indexOf('Support by') < project.indexOf('<h2'));
  assert.match(project, /AI Film &amp; Narrative \/ 影视级AI剧集/);
  assert.match(project, /Explore XUANTIAN JUE/);
});

test('AI credit wraps without introducing a border or altering homepage styles', () => {
  const css = read('assets/portfolio.css');
  assert.doesNotMatch(css, /project-support/);
  assert.match(css, /\.content-page #xuantian \.project-tool-line--detail\s*\{[^}]*max-width:\s*100%;[^}]*flex-wrap:\s*wrap;/);
  for (const logo of ['dreamina-mark.svg', 'xinpianchang-mark.svg']) {
    assert.ok(fs.existsSync(path.join(root, 'assets/images/logos', logo)));
  }
});
