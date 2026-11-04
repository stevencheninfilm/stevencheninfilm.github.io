const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { OUTPUT, SOURCES, renderBundle, isCurrent } = require('../tools/build-home-css.cjs');
const root = path.resolve(__dirname, '..');

test('homepage bundle preserves the original cascade and relative asset URLs', () => {
  assert.deepEqual(SOURCES.map(source => path.basename(source)), [
    'site.css', 'home-v2.css', 'home-opening.css', 'banner-v3.css',
    'portfolio.css', 'cinema-workflows.css', 'dlss-detail.css', 'cat-nest-home.css',
    'tvc-transition.css', 'xuantian-brand.css', 'icp-footer.css', 'media-access.css', 'progressive-video-status.css', 'home-locales.css', 'site-language.css',
  ]);
  const bundle = renderBundle();
  let previous = -1;
  for (const source of SOURCES) {
    const original = fs.readFileSync(path.join(root, source), 'utf8').trimEnd();
    const position = bundle.indexOf(`/* Source: ${source} */\n${original}\n`);
    assert.ok(position > previous, `${source} must retain its content and cascade position`);
    previous = position;
    for (const [, asset] of original.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
      if (/^(?:data:|https?:|\/|#)/.test(asset)) continue;
      assert.equal(path.resolve(root, path.dirname(OUTPUT), asset),
        path.resolve(root, path.dirname(source), asset), `${asset} must resolve to the same file`);
    }
  }
  assert.match(bundle, /\.video-loading-ui\.is-progressive\[hidden\]\s*\{\s*display:\s*none;/);
});

test('committed homepage bundle is fresh', () => {
  assert.equal(isCurrent(), true);
  assert.match(execFileSync(process.execPath, ['tools/build-home-css.cjs', '--check'], {
    cwd: root, encoding: 'utf8',
  }), /is current \(15 source stylesheets\)/);
});

test('source edits invalidate the bundle and unsafe import concatenation fails', (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'home-css-bundle-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fixture, 'assets'));
  for (const source of SOURCES) fs.writeFileSync(path.join(fixture, source), '.sample { color: white; }\n');
  assert.equal(isCurrent(fixture), false);
  fs.writeFileSync(path.join(fixture, OUTPUT), renderBundle(fixture));
  assert.equal(isCurrent(fixture), true);
  fs.appendFileSync(path.join(fixture, SOURCES.at(-1)), '.sample { color: gold; }\n');
  assert.equal(isCurrent(fixture), false);
  fs.appendFileSync(path.join(fixture, SOURCES[0]), '@import "extra.css";\n');
  assert.throws(() => renderBundle(fixture), /Resolve @charset\/@import/);
});
