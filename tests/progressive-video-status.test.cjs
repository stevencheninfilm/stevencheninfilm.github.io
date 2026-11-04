const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/progressive-video-status.js'), 'utf8');

function element() {
  let text = '';
  return {
    dataset: {}, attrs: {}, events: {}, hidden: true, writes: [], disabled: false,
    get textContent() { return text; },
    set textContent(value) { text = value; this.writes.push(value); },
    get value() { return Number(this.attrs.value || 0); },
    set value(value) { this.attrs.value = String(value); },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name] ?? null; },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener(name, listener) { (this.events[name] ||= []).push(listener); },
    fire(name, event = {}) {
      for (const listener of this.events[name] || []) listener({ target: this, ...event });
    },
  };
}

function player({ localLang, standalone = false, progress = true, percent = true, retry = true } = {}) {
  const owner = element(), status = element(), label = element();
  const bar = progress ? element() : null;
  const percentLabel = percent ? element() : null;
  const button = retry ? element() : null;
  const languageNode = localLang ? { getAttribute: () => localLang } : null;
  const children = { '[data-hd-label]': label, '[data-hd-progress]': bar, '[data-hd-percent]': percentLabel, '[data-hd-retry]': button };
  status.querySelector = selector => children[selector];
  status.closest = selector => selector === '[lang]' ? languageNode : standalone ? null : owner;
  status.parentElement = { querySelector: selector => selector === 'video[data-src-hd]' ? owner : null };
  owner.load = () => { throw new Error('status UI must not load media'); };
  owner.play = () => { throw new Error('status UI must not control playback'); };
  return { owner, status, label, bar, percentLabel, button,
    state(detail) { owner.fire('progressive-video:state', { detail }); } };
}

function setup({ language = 'en', players = [player()], initial = new Map(), onRetry = () => false } = {}) {
  const requests = [], observers = [];
  const api = {
    getStatus: owner => initial.get(owner) || null,
    retry(owner) { requests.push(owner); return onRetry(owner); },
  };
  vm.runInNewContext(source, {
    document: { documentElement: { lang: language }, querySelectorAll: () => players.map(p => p.status) },
    window: { ProgressiveVideo: api },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.targets = []; observers.push(this); }
      observe(target, options) { this.targets.push({ target, options }); }
    },
  });
  return { players, requests, api, observers };
}

function activate(button) {
  let prevented = false, stopped = false;
  button.fire('click', { preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  return { prevented, stopped };
}

test('pending stays quiet; loading uses actual percentages and unknown lengths remain indeterminate', () => {
  const p = player(); setup({ players: [p] });
  assert.equal(p.status.hidden, true);
  assert.equal(p.label.textContent, '');
  assert.equal(p.bar.hidden, true);
  p.state({ state: 'loading', loaded: 430, total: 1000, percent: 43, quality: 'preview' });
  assert.equal(p.status.hidden, false);
  assert.equal(p.label.textContent, 'Loading HD');
  assert.equal(p.bar.max, 100);
  assert.equal(p.bar.value, 43);
  assert.equal(p.percentLabel.textContent, '43%');
  assert.equal(p.percentLabel.hidden, false);
  p.state({ state: 'loading', loaded: 800, total: null, percent: null, quality: 'preview' });
  assert.equal(p.bar.hidden, false);
  assert.equal(p.bar.getAttribute('value'), null);
  assert.equal(p.percentLabel.hidden, true);
  assert.equal(p.percentLabel.textContent, '');
  assert.equal(p.button.hidden, true);
});

test('frequent byte updates do not become repeated live announcements', () => {
  const p = player(); setup({ players: [p] });
  p.state({ state: 'loading', percent: 1 });
  for (let percent = 2; percent <= 96; percent++) p.state({ state: 'loading', percent });
  assert.deepEqual(p.label.writes, ['Loading HD']);
  assert.equal(p.label.attrs.role, 'status');
  assert.equal(p.label.attrs['aria-live'], 'polite');
  assert.equal(p.bar.attrs['aria-live'], 'off');
  assert.equal(p.percentLabel.attrs['aria-hidden'], 'true');
  assert.equal(p.bar.value, 96);
  p.state({ state: 'switching', percent: 100 });
  assert.equal(p.label.textContent, 'Switching to HD');
  assert.equal(p.bar.hidden, true);
  p.state({ state: 'hd', quality: 'hd', percent: 100 });
  assert.equal(p.label.textContent, 'HD');
  assert.equal(p.status.dataset.hdState, 'hd');
  assert.equal(p.button.hidden, true);
});

test('page language and an explicit local language select the correct status and retry labels', () => {
  const chinese = player(), english = player({ localLang: 'en' });
  setup({ language: 'zh-Hans', players: [chinese, english] });
  chinese.state({ state: 'loading', percent: 30 });
  english.state({ state: 'loading', percent: 30 });
  assert.equal(chinese.label.textContent, '高清加载中');
  assert.equal(english.label.textContent, 'Loading HD');
  assert.equal(chinese.button.textContent, '重试替换');
  assert.equal(english.button.textContent, 'Retry HD');
  const localChinese = player({ localLang: 'zh-Hans' });
  setup({ language: 'en', players: [localChinese] });
  localChinese.state({ state: 'hd', quality: 'hd' });
  assert.equal(localChinese.label.textContent, '高清');
});

test('groups and standalone videos own independent statuses and ignore nested-player events', () => {
  const first = player(), second = player(), standalone = player({ standalone: true });
  setup({ players: [first, second, standalone] });
  first.state({ state: 'loading', percent: 17 });
  second.state({ state: 'hd', quality: 'hd' });
  standalone.state({ state: 'error', retryable: true });
  assert.equal(first.bar.value, 17);
  assert.equal(second.label.textContent, 'HD');
  assert.equal(standalone.button.hidden, false);
  first.owner.fire('progressive-video:state', { target: second.owner, detail: { state: 'error', retryable: true } });
  assert.equal(first.status.dataset.hdState, 'loading');
  assert.equal(first.button.hidden, true);
});

test('late initialization restores the current engine state without requesting or playing media', () => {
  const p = player();
  const { requests } = setup({ players: [p], initial: new Map([[p.owner, { state: 'hd', quality: 'hd' }]]) });
  assert.equal(p.status.hidden, false);
  assert.equal(p.label.textContent, 'HD');
  assert.equal(p.bar.hidden, true);
  assert.deepEqual(requests, []);
});

test('failure exposes a scoped retry and accepted retries follow the engine state', () => {
  const p = player();
  const initial = new Map();
  const { requests } = setup({ players: [p], initial, onRetry(owner) {
    initial.set(owner, { state: 'loading', loaded: 0, total: null, percent: null });
    return true;
  } });
  p.state({ state: 'error', quality: 'preview', retryable: true });
  assert.equal(p.label.textContent, 'HD unavailable');
  assert.equal(p.button.hidden, false);
  let pointerStopped = false, pointerPrevented = false;
  p.button.fire('pointerdown', { stopPropagation() { pointerStopped = true; }, preventDefault() { pointerPrevented = true; } });
  assert.equal(pointerStopped, true);
  assert.equal(pointerPrevented, false, 'retry remains focusable with the pointer');
  assert.deepEqual(activate(p.button), { stopped: true, prevented: true });
  assert.deepEqual(requests, [p.owner]);
  assert.equal(p.label.textContent, 'Loading HD');
  assert.equal(p.button.hidden, true);
  activate(p.button);
  assert.equal(requests.length, 1, 'a hidden retry cannot restart an active download');
});

test('a denied or unavailable retry keeps the preview failure actionable; cancellation is quiet', () => {
  for (const onRetry of [() => false, () => { throw new Error('unavailable'); }]) {
    const p = player(); setup({ players: [p], onRetry });
    p.state({ state: 'error', retryable: true });
    activate(p.button);
    assert.equal(p.button.disabled, false);
    assert.equal(p.button.hidden, false);
    assert.equal(p.label.textContent, 'HD unavailable');
    p.state({ state: 'preview', quality: 'preview', retryable: false });
    assert.equal(p.status.hidden, true);
    assert.equal(p.button.hidden, true);
    assert.equal(p.label.textContent, '');
  }
});

test('a compact label-only badge tolerates missing optional progress and retry controls', () => {
  const p = player({ progress: false, percent: false, retry: false }); setup({ players: [p] });
  p.state({ state: 'loading', percent: null });
  assert.equal(p.label.textContent, 'Loading HD');
  p.state({ state: 'restoring' });
  assert.equal(p.label.textContent, 'Restoring preview');
  p.state({ state: 'error', retryable: false });
  assert.equal(p.status.hidden, false);
  p.state({ state: 'waiting' });
  assert.equal(p.status.hidden, true);
});

test('status keyboard and pointer events stay local without canceling native button activation', () => {
  const p = player();
  const { requests } = setup({ players: [p], onRetry: () => false });
  p.state({ state: 'error', retryable: true });
  for (const name of ['keydown', 'keyup']) {
    for (const key of ['ArrowRight', 'ArrowDown', 'Enter', ' ', 'Tab']) {
      let stopped = false, prevented = false;
      p.status.fire(name, { target: p.button, key,
        stopPropagation() { stopped = true; }, preventDefault() { prevented = true; } });
      assert.equal(stopped, true, `${name} ${key} must not reach project navigation`);
      assert.equal(prevented, false, `${name} ${key} must retain its native default`);
    }
  }
  for (const name of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click']) {
    let stopped = false, prevented = false;
    p.status.fire(name, { target: p.bar,
      stopPropagation() { stopped = true; }, preventDefault() { prevented = true; } });
    assert.equal(stopped, true, `${name} must not drag or activate the background`);
    assert.equal(prevented, false, `${name} must not cancel native behavior`);
  }
  assert.equal(requests.length, 0, 'keyboard handling does not synthesize extra clicks');
  activate(p.button);
  assert.deepEqual(requests, [p.owner], 'the native click still reaches the retry handler');
});

test('a failed home card loses keyboard access while inactive or in overview and restores it on return', () => {
  const p = player();
  let active = true, strip = false, hidden = false;
  const deck = { classList: { contains: name => name === 'is-strip' && strip } };
  const card = {
    classList: { contains: name => name === 'is-active' && active },
    closest: selector => selector === '.project-deck' ? deck : null,
  };
  p.owner.closest = selector => selector === '.deck-card' ? card
    : selector === '[aria-hidden="true"], [hidden]' && hidden ? card : null;
  const { observers } = setup({ players: [p] });
  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].targets.map(entry => entry.target), [card, deck]);
  p.state({ state: 'error', retryable: true });
  assert.equal(p.button.hidden, false);
  assert.equal(p.status.inert, false);
  active = false; observers[0].callback();
  assert.equal(p.status.inert, true, 'a visible error in the previous card cannot retain a Tab stop');
  assert.equal(p.status.dataset.hdState, 'error', 'moving away does not discard the retry state');
  active = true; strip = true; observers[0].callback();
  assert.equal(p.status.inert, true, 'overview cards expose only their selection control');
  strip = false; hidden = true; observers[0].callback();
  assert.equal(p.status.inert, true, 'aria-hidden or hidden ancestors remain inaccessible');
  hidden = false; observers[0].callback();
  assert.equal(p.status.inert, false);
  assert.equal(p.button.hidden, false, 'the retry button is available again on the active card');
});

test('workflow panels follow their hidden state while ordinary standalone players add no observer', () => {
  const p = player(), ordinary = player({ standalone: true });
  const panel = {};
  let hidden = true;
  p.owner.closest = selector => selector === '[data-workflow-item]' ? panel
    : selector === '[aria-hidden="true"], [hidden]' && hidden ? panel : null;
  const { observers } = setup({ players: [p, ordinary] });
  assert.equal(observers.length, 1);
  assert.deepEqual(observers[0].targets.map(entry => entry.target), [panel]);
  p.state({ state: 'error', retryable: true });
  assert.equal(p.status.inert, true);
  hidden = false; observers[0].callback();
  assert.equal(p.status.inert, false);
});
