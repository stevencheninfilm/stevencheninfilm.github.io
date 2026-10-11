const test = require('node:test');
const assert = require('node:assert/strict');
const { sampleScroll, createCuePlayer } = require('../assets/xuantian-characters.js');
const cues = [65 / 24, 198 / 24, 304 / 24];

function fixture({ blocked = false, frameCallbacks = true } = {}) {
  const callbacks = new Map(), listeners = {}, states = [];
  let sequence = 0;
  const video = {
    currentTime: 0, paused: true, playCalls: 0,
    addEventListener(type, fn) { listeners[type] = fn; },
    pause() { this.paused = true; },
    play() { this.playCalls++; if (blocked) return Promise.reject(new Error('NotAllowedError')); this.paused = false; listeners.playing(); return Promise.resolve(); },
  };
  const win = {
    requestAnimationFrame(fn) { callbacks.set(++sequence, fn); return sequence; },
    cancelAnimationFrame(id) { callbacks.delete(id); }
  };
  if (frameCallbacks) {
    video.requestVideoFrameCallback = win.requestAnimationFrame;
    video.cancelVideoFrameCallback = win.cancelAnimationFrame;
  }
  const player = createCuePlayer(video, cues, state => states.push(state), win);
  const advance = time => {
    video.currentTime = time;
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(fn => fn(0, { mediaTime: time }));
  };
  return { video, player, states, callbacks, listeners, advance };
}

test('three reading beats stay pinned, then release after the last character', () => {
  assert.deepEqual([-100, 0, 699, 700, 1399, 1400, 2099, 2100].map(y => sampleScroll(y, 700)), [
    {index:0,released:false},{index:0,released:false},{index:0,released:false},
    {index:1,released:false},{index:1,released:false},{index:2,released:false},
    {index:2,released:false},{index:2,released:true}
  ]);
});

test('each forward scroll request plays to its matched frame and holds without looping', () => {
  const f = fixture();
  assert.equal(f.video.playCalls, 0);
  for (let i = 0; i < cues.length; i++) {
    f.player.go(i);
    assert.equal(f.video.paused, false);
    f.advance(cues[i] - 1/24);
    assert.equal(f.video.paused, false);
    f.advance(cues[i] + .012);
    assert.equal(f.video.paused, true);
    assert.ok(Math.abs(f.video.currentTime - cues[i]) < 1/24);
    assert.deepEqual(f.states.at(-1), {phase:'held',index:i});
    assert.equal(f.callbacks.size, 0);
    f.player.go(i);
    assert.equal(f.video.playCalls, i + 1, 'holding must not restart playback');
  }
});

test('reverse scrolling restores the earlier frame without playing backwards', () => {
  const f = fixture();
  f.player.go(2, {instant:true});
  f.player.go(0);
  assert.equal(f.video.paused, true);
  assert.equal(f.video.playCalls, 0);
  assert.deepEqual(f.states.at(-1), {phase:'held',index:0});
  f.player.go(1);
  assert.equal(f.video.playCalls, 1);
  assert.equal(f.video.paused, false);
});

test('quick scrolling uses the latest target and releases even mid-playback', () => {
  const f = fixture();
  f.player.go(0);
  f.advance(1);
  f.player.go(2);
  f.advance(4);
  assert.equal(f.player.running, true);
  assert.notEqual(f.states.at(-1).phase, 'held');
  f.player.go(2, {instant:true});
  assert.equal(f.player.running, false);
  assert.equal(f.video.paused, true);
  assert.equal(f.callbacks.size, 0);
  assert.deepEqual(f.states.at(-1), {phase:'held',index:2});
});

test('leaving the section or hiding the page pauses work and re-entry can resume', () => {
  const f = fixture();
  f.player.go(1);
  f.advance(4);
  f.player.suspend();
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.video.paused, true);
  f.player.go(1);
  f.advance(cues[1]);
  assert.deepEqual(f.states.at(-1), {phase:'held',index:1});
});

test('autoplay rejection exposes a static portrait and manual retry begins at the previous cue', async () => {
  const f = fixture({blocked:true});
  f.player.go(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.states.at(-1), {phase:'blocked',index:1});
  assert.equal(f.video.paused, true);
  assert.equal(f.callbacks.size, 0);
  f.player.go(1, {restart:true});
  assert.ok(Math.abs(f.video.currentTime - cues[0]) < 1/24);
  await new Promise(resolve => setImmediate(resolve));
});

test('browsers without frame callbacks still stop, and late play events cannot restart a held frame', () => {
  const f = fixture({frameCallbacks:false});
  f.player.go(0);
  f.advance(cues[0]);
  f.listeners.playing();
  assert.equal(f.video.paused, true);
  assert.equal(f.callbacks.size, 0);
  assert.deepEqual(f.states.at(-1), {phase:'held',index:0});
});

test('a rejected old play promise cannot replace a newer held character', async () => {
  const f = fixture({blocked:true});
  f.player.go(0);
  f.player.go(2, {instant:true});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.states.at(-1), {phase:'held',index:2});
});
