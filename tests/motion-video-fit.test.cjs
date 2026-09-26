const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ai/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/portfolio.css'), 'utf8');
const motion = html.split('id="motion">')[1].split('</section>')[0];

test('only the workflow video hides its encoded black pillars', () => {
  assert.equal((html.match(/project-feature__media--uncropped/g) || []).length, 1);
  assert.equal((html.match(/project-feature__media--trim-bars/g) || []).length, 1);
  assert.match(motion, /project-feature__media--uncropped/);
  assert.match(motion, /project-feature__media--trim-bars/);
  assert.match(motion, /<video width="1049" height="576"/);
});

test('only the 90px black pillars are hidden, with full content height retained', () => {
  assert.match(css, /\.project-feature__media\.project-feature__media--trim-bars\s*\{\s*aspect-ratio:\s*295\s*\/\s*216;/);
  assert.match(css, /\.project-feature__media--trim-bars video\s*\{[^}]*inset:\s*0 auto 0 calc\(-100% \/ 6\);[^}]*width:\s*calc\(100% \* 4 \/ 3\);[^}]*height:\s*100%;/);
  const encodedWidth = 720, pillar = 90, height = 576, sar = 118 / 81;
  assert.equal((encodedWidth - 2 * pillar) * sar / height, 295 / 216);
});

test('matching poster replaces the unrelated image and video bytes are untouched', () => {
  assert.match(motion, /poster="\.\.\/assets\/images\/ui\/veo-workflow-poster-20260925\.png"/);
  const poster = fs.readFileSync(path.join(root, 'assets/images/ui/veo-workflow-poster-20260925.png'));
  assert.equal(poster.readUInt32BE(16), 1049);
  assert.equal(poster.readUInt32BE(20), 576);
  const video = fs.readFileSync(path.join(root, 'assets/videos/veo-after-video-silent.mp4'));
  assert.equal(crypto.createHash('sha256').update(video).digest('hex'), 'a1e053749713f7f968f2afb01ccf3686aeb82f16c15f1485b95db0f69d62d0f4');
});

test('native playback, lazy loading and reduced-motion behavior remain intact', () => {
  assert.match(motion, /autoplay muted loop playsinline preload="none"/);
  assert.match(motion, /data-video-loading data-video-static-on-reduced-motion/);
  assert.match(motion, /data-src="\.\.\/assets\/videos\/veo-after-video-silent\.mp4"/);
  assert.match(motion, /video-loading-retry/);
});

test('height follows the complete frame and hover cannot introduce new cropping', () => {
  assert.match(css, /\.project-feature__media\.project-feature__media--uncropped\s*\{[^}]*min-height:\s*0;[^}]*aspect-ratio:\s*auto;/);
  assert.match(css, /\.project-feature__media--uncropped video\s*\{[^}]*position:\s*static;[^}]*width:\s*100%;[^}]*height:\s*auto;[^}]*object-fit:\s*contain;/);
  assert.match(css, /\.project-feature:hover \.project-feature__media--uncropped video\s*\{[^}]*transform:\s*none;[^}]*transition:\s*none;/);
});
