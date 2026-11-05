const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OUTPUTS, renderPage } = require('../tools/build-ai-pages.cjs');
const root = path.resolve(__dirname, '..');
const pages = () => Object.entries(OUTPUTS).map(([file, language]) => ({ file, language, html: renderPage(file, language) }));
const project = html => {
  const section = html.match(/<section\b[^>]*\bid="shotlab-sunrise"[^>]*>[\s\S]*?<\/section>/);
  assert.ok(section, 'Shotlab project has a stable direct-link anchor');
  return section[0];
};

const chineseCopy = [
  '一盏只在夜里醒来的灯，决定去追一次日出。',
  '这是一支为 ShotLab 创作的 AI 品牌 TVC。影片以一盏拟人化路灯为主角，从一句文字开始，让它穿越盛唐长安、民国都市、战时中国与现代城市，在不同历史与空间中始终保持同一个角色身份，最终抵达海边，看见它从未见过的日出。',
  '创作过程中将 角色参考、场景参考、图像生成、视频生成、角色一致性与 Canvas 节点式工作流融入叙事，让产品能力不以传统功能演示出现，而成为故事本身的一部分。',
  '视觉上尝试以第三人称连续运镜与一镜到底的观感，把不同年代、场景与角色形态连接成一次完整旅程。',
  'ShotLab｜无限创作，打动世界。',
];

// Check the publishing contract rather than the presentational CSS, so the
// project can be restyled without weakening its content and route guarantees.
test('Shotlab replaces the retired motion study before Feel Every Stories in each AI route', () => {
  for (const { file, html } of pages()) {
    project(html);
    assert.equal((html.match(/id="shotlab-sunrise"/g) || []).length, 1, file);
    assert.ok(html.indexOf('id="shotlab-sunrise"') < html.indexOf('id="feel"'), file);
    assert.doesNotMatch(html, /id="motion"|From Prompt to Motion|从画面到动态/, file);
    assert.doesNotMatch(html, /veo-after-video-(?:preview-v1|silent)\.mp4/, file);
    assert.doesNotMatch(html, /新片场备用/, file);
  }
});

test('Chinese Shotlab story retains the supplied paragraphs, date and full credits', () => {
  const section = project(renderPage('zh/ai/index.html', 'zh'));
  const story = section.match(/<div class="shotlab-project__story">([\s\S]*?)<\/div>/)[1];
  const paragraphs = [...story.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(match => match[1].trim());
  assert.deepEqual(paragraphs, chineseCopy);
  assert.match(section, /<h2[^>]*>去追一次日出/);
  assert.match(section, /剪辑指导 \/ AIGCer \/ 总导演/);
  assert.match(section, /<time[^>]*datetime="2026-09"[^>]*>2026 年 9 月<\/time>/);
  assert.match(section, /Chase the Sunrise/);
});

test('every locale offers the provided HTTPS film destination and the corresponding credit', () => {
  for (const { language, html } of pages()) {
    const section = project(html);
    const viewingLink = section.match(/<a\b[^>]*href="https:\/\/www\.xinpianchang\.com\/a13815577"[^>]*>/);
    assert.ok(viewingLink, language);
    assert.match(viewingLink[0], /\bdata-viewing-link\b/, language);
    assert.match(viewingLink[0], /rel="[^"]*noreferrer/, language);
    assert.match(section, /datetime="2026-09"/);
    if (language === 'en') {
      assert.match(section, /Editing Supervisor \/ AIGC Artist \/ Director/);
      assert.match(section, /<h2[^>]*>Chase the Sunrise/);
    }
  }
});

test('the seven supplied visuals are distinct WebP files within a lightweight gallery budget', () => {
  const expected = ['hero', 'lamp', 'sunrise', 'character-reference', 'scene-reference', 'scene-extension', 'selection'];
  for (const { file, html } of pages()) {
    const images = [...project(html).matchAll(/<img\b[^>]*>/g)].map(match => match[0]);
    assert.equal(images.length, expected.length, file);
    const sources = images.map(tag => tag.match(/\bsrc="([^"]+)"/)[1]);
    assert.equal(new Set(sources).size, expected.length, file);
    assert.deepEqual(sources.map(source => path.basename(source, '.webp')), expected, file);
    let totalBytes = 0;
    for (let index = 0; index < images.length; index++) {
      assert.match(images[index], /loading="lazy"/, file);
      assert.match(images[index], /decoding="async"/, file);
      assert.match(images[index], /\balt="[^"]+"/, file);
      const imagePath = path.resolve(root, path.dirname(file), sources[index]);
      const bytes = fs.readFileSync(imagePath);
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', imagePath);
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', imagePath);
      totalBytes += bytes.length;
    }
    assert.ok(totalBytes < 2 * 1024 * 1024, `${file}: seven project images must stay below 2 MiB combined`);
  }
});
