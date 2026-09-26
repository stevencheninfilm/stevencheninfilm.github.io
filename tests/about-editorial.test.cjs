const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/about.css'), 'utf8');

test('About has one name heading, five navigable chapters and a direct collaboration route', () => {
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  for (const id of ['background','practice','collaborations','recognition','contact']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, new RegExp(`href="#${id}"`));
  }
  assert.match(html, /class="ab-link ab-link--primary" href="#contact"/);
  assert.match(html, /href="mailto:kieen1454@gmail.com"/);
  assert.match(html, /tel:\+13475745244/);
  assert.match(html, /tel:\+8613774300777/);
});

test('current partnerships are distinct from commercial production credits', () => {
  const partners = html.match(/<dl class="ab-partner-list">[^]*?<\/dl>/)[0];
  for (const name of ['Dreamina AI', 'Shotlab', 'Moodio AI Agent', 'OpenCreator.io']) assert.ok(partners.includes(name));
  assert.match(partners, /CMU student-led team/);
  assert.doesNotMatch(partners, /Netflix|Tesla|GE HealthCare/);
  assert.match(html, /Selected commercial credits/);
  assert.match(html, /USC School of Cinematic Arts/);
  assert.match(html, /MFA ’26/);
  assert.match(html, /School of Visual Arts, New York/);
  assert.doesNotMatch(html, /56\+|26\+|近\s*10\s*年|YOUR LOGO|4\.45ETH/);
});

test('recognition preserves award levels, project names and future-event status', () => {
  assert.match(html, /2026-10-25[^]*?Upcoming \/ Jury[^]*?Preliminary Jury Member/);
  assert.match(html, /2026-05-28[^]*?Invited Presenter/);
  assert.match(html, /Golden Sparrow Awards[^]*?Best Editing, Second Prize[^]*?Feel Every Stories/);
  assert.match(html, /创作人最佳剪辑 · 二等奖/);
  assert.match(html, /International Short Film Award Finalist · Screened/);
  assert.match(html, /Grand Jury Award · Screened/);
});

test('cinema media is intentional, accessible and preserves the full frame', () => {
  const videos = [...html.matchAll(/<video\b[^]*?<\/video>/g)].map(m => m[0]);
  assert.equal(videos.length, 2);
  for (const video of videos) {
    assert.match(video, /muted loop playsinline preload="none"/);
    assert.match(video, /data-src-mobile=/);
    assert.doesNotMatch(video, /autoplay/);
  }
  assert.match(videos[0], /aria-label="Grand Theft Art/);
  assert.match(html, /role="slider"[^>]*aria-valuenow="50"/);
  assert.match(html, /class="ab-compare__play"/);
  assert.match(html, /assets\/about-comparison.js/);
  assert.match(css, /\.ab-motion video[^}]*aspect-ratio: 16 \/ 9;[^}]*object-fit: contain/);
  assert.match(css, /\.ab-hero__portrait img[^}]*filter: none/);
  assert.match(css, /clip-path: inset\(0 0 0 var\(--compare-split\)\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  for (const tag of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(tag[0], /width="\d+"/);
    assert.match(tag[0], /height="\d+"/);
    assert.match(tag[0], /alt="[^"]+"/);
  }
});

test('all local assets, links and fragment destinations resolve', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const m of html.matchAll(/\b(?:src|href|poster)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(?:https?:|mailto:|tel:)/.test(url)) continue;
    if (url.startsWith('#')) { assert.ok(ids.includes(url.slice(1)), url); continue; }
    assert.ok(fs.existsSync(path.resolve(root, url.split(/[?#]/)[0])), url);
  }
  // New layout stays page-local rather than changing shared portfolio CSS.
  assert.match(html, /assets\/about.css\?v=/);
  assert.ok(css.split('\n').filter(line => line.startsWith('.')).every(line => line.startsWith('.about-page')));
});
