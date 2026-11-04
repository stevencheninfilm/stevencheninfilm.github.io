const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/xuantian-player.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const element = extra => Object.assign({
    events: {}, dataset: {}, hidden: false,
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); },
    emit(type) { for (const fn of this.events[type] || []) fn(); }
  }, extra);
  const nodes = {};
  let rejectPlay, upgrading = false, timer = 0;
  const timers = new Map(), intents = [];
  const video = element({
    dataset: { src: '/trailer-540p-preview.mp4', srcHd: '/trailer-1080p-hd.mp4' },
    paused: true, readyState: 0, muted: true, controls: false, loads: 0,
    getAttribute(name) { return name === 'src' ? this.src || null : null; },
    load() { this.loads++; },
    play() {
      this.paused = false; this.emit('play');
      return new Promise((resolve, reject) => { rejectPlay = reject; });
    }
  });
  const shell = element({ querySelector: selector => nodes[selector] });
  for (const selector of ['.xj-video-play', '.xj-player-status', '.xj-player-help', '.xj-player-message', '.xj-player-retry']) nodes[selector] = element();
  nodes.video = video;
  const window = element({
    clearTimeout: id => timers.delete(id),
    setTimeout: fn => { timers.set(++timer, fn); return timer; },
    ProgressiveVideo: {
      isSwitching: () => upgrading,
      getIntent: () => ({ paused: video.paused }),
      setIntent: (node, intent) => intents.push(intent)
    }
  });
  vm.runInNewContext(source, { window, document: { querySelector: () => shell }, navigator: { onLine: true } });
  return { shell, video, nodes, intents, timers,
    startUpgrade() { upgrading = true; shell.emit('progressive-video:switch-start'); },
    finishUpgrade(event = 'progressive-video:switch-end') { upgrading = false; shell.emit(event); },
    reject(error) { rejectPlay?.(error); }
  };
}

test('trailer first tap starts the compatible preview synchronously without waiting for HD', () => {
  const f = fixture();
  assert.equal(f.video.src, undefined);
  f.nodes['.xj-video-play'].emit('click');
  assert.equal(f.video.src, '/trailer-540p-preview.mp4');
  assert.equal(f.video.loads, 1);
  assert.equal(f.video.paused, false);
  assert.equal(f.video.muted, false);
  assert.equal(f.shell.dataset.playerState, 'loading');
});

test('programmatic quality-switch pause/error and stale play rejection cannot replace the player with an error cover', async () => {
  const f = fixture();
  f.nodes['.xj-video-play'].emit('click');
  f.video.readyState = 4; f.video.emit('playing');
  f.startUpgrade();
  f.video.paused = true; f.video.emit('pause'); f.video.emit('error');
  f.reject(Object.assign(new Error('source changed'), { name: 'AbortError' }));
  await flush();
  assert.equal(f.shell.dataset.playerState, 'playing');
  assert.equal(f.nodes['.xj-player-help'].hidden, true);
  assert.equal(f.timers.size, 0);
  f.video.paused = false;
  f.finishUpgrade();
  f.video.emit('playing');
  assert.equal(f.shell.dataset.playerState, 'playing');
  assert.equal(f.video.loads, 1, 'completion does not reload the preview');
});

test('quality completion preserves pause and mute; explicit play during the switch updates intent', () => {
  const f = fixture();
  f.startUpgrade();
  f.nodes['.xj-video-play'].emit('click');
  assert.equal(f.intents.length, 1);
  assert.equal(f.intents[0].paused, false);
  assert.equal(f.intents[0].muted, false);
  f.video.muted = true;
  f.finishUpgrade('progressive-video:switch-error');
  assert.equal(f.shell.dataset.playerState, 'idle');
  assert.equal(f.video.muted, true);
  assert.equal(f.video.paused, true);
  assert.equal(f.video.loads, 0);
});
