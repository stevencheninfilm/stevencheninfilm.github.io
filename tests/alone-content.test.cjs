const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'film/film.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'film/Film.html'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.split('const grid = document.querySelector')[0], context);
vm.runInContext(source.slice(source.indexOf('const escapeHTML ='), source.indexOf('// The page overview')), context);
const projects = vm.runInContext('projects', context);
const alone = projects.find(project => project.id === 'alone');

test('Alone is film 01 and other films retain their relative order', () => {
  assert.deepEqual(Array.from(projects.filter(project => !project.collection), project => project.id), [
    'alone', 'tumbleweed', 'everylook', 'healing', 'reason', 'papa', 'power', 'cube', 'invert'
  ]);
  assert.equal(projects.filter(project => project.id === 'alone').length, 1);
  assert.match(source, /const isWide = collection === 'film' && index % 3 === 0/);
  assert.equal(alone.count, 12);
  assert.equal(alone.duration, '18 min');
  assert.equal(alone.link[1], 'https://www.xinpianchang.com/a12617120?from=UserProfile');
});

test('Alone uses the exact supplied synopsis and an equivalent English version', () => {
  assert.equal(alone.descriptionZh, 'Alone，她讲述的是一个与孙子一起生活在美国的中国人，在孙子与大学同学出去游玩的时候独自面对支付电话费的故事。由于不懂英语，她遭遇了困难。在邻居的帮助下成功解决了问题，并且在最后孙子回来之后，她开始坦然面对自己英语不好的问题，并且开始寻找解决方法。');
  for (const phrase of ['grandson', 'college classmates', 'phone bill', 'neighbor', 'language barrier']) {
    assert.ok(alone.description.includes(phrase), phrase);
  }
  assert.doesNotMatch(alone.description, /Flushing|three months|undergraduate thesis/);
});

test('all six recognition entries preserve years, outcomes and screenings in both languages', () => {
  const entries = Array.from(alone.recognition);
  assert.equal(entries.length, 6);
  assert.deepEqual(entries.map(item => item.year), ['2023', '2023', '2022', '2023', '2022', '2023']);
  assert.equal(entries.filter(item => item.en.includes('Screened')).length, 3);
  assert.equal(entries.filter(item => item.zh.includes('展映')).length, 3);
  assert.match(entries[0].en, /53rd USA Film Festival.*Finalist/);
  assert.match(entries[1].en, /Los Angeles Film Awards.*Best Documentary Winner/);
  assert.match(entries[1].zh, /最佳纪录片奖得主/);
  assert.match(entries[2].en, /New York International Film Awards™.*Grand Jury Award/);
  assert.match(entries[3].en, /International New York Film Festival.*Official Selection/);
  assert.match(entries[4].en, /Oniros Film Awards®.*Finalist/);
  assert.match(entries[5].en, /9th New Vision.*Official Selection/);
  assert.doesNotMatch(entries[5].en, /Finalist|Winner|Screened/);
});

test('page overview and dialog use the same escaped bilingual recognition renderer', () => {
  assert.match(html, /class="film-recognition-list" data-project-recognition="alone"/);
  assert.match(source, /list.innerHTML = recognitionItemsHTML\(project\?\.recognition \|\| \[\]\)/);
  assert.match(source, /recognitionItemsHTML\(project.recognition\)/);
  const markup = vm.runInContext('recognitionItemsHTML(projects[0].recognition)', context);
  assert.equal((markup.match(/<li>/g) || []).length, 6);
  assert.equal((markup.match(/lang="en"/g) || []).length, 6);
  assert.equal((markup.match(/lang="zh-Hans"/g) || []).length, 6);
  assert.doesNotMatch(markup, /\[object Object\]/);
  assert.match(vm.runInContext(`recognitionItemsHTML([{year: '2023', en: '<script>', zh: 'A & B'}])`, context), /&lt;script&gt;[\s\S]*A &amp; B/);
});
