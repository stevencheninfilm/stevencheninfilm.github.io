const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { renderPage } = require('../tools/build-avocado-pages.cjs');
const source = fs.readFileSync(require.resolve('../assets/avocado-ai.js'), 'utf8');

function setup({ reducedMotion = false, finePointer = true, saveData = false, initialHash = '', initialState = null, readyState = 'complete' } = {}) {
  const html = renderPage('zh/avocado-ai/index.html', 'zh');
  let activeElement = null, now = 0, timerId = 0;
  const timers = new Map(), requests = [], posterRequests = [], copies = [], historyWrites = [];
  function element({ tagName = 'DIV', attributes = {}, ...extra } = {}) {
    const listeners = new Map(), attrs = new Map(Object.entries(attributes)), classes = new Set();
    return Object.assign({
      tagName, dataset: {}, hidden: attrs.has('hidden'), disabled: false, isConnected: true, textContent: '', clickCount: 0, scrollCount: 0,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      addEventListener(type, callback) {
        const callbacks = listeners.get(type) || [];
        callbacks.push(callback); listeners.set(type, callbacks);
      },
      fire(type, detail = {}) {
        const event = Object.assign({ type, target: this, currentTarget: this, button: 0,
          metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; } }, detail);
        for (const callback of listeners.get(type) || []) callback(event);
        return event;
      },
      getAttribute(name) { return attrs.get(name) ?? null; },
      hasAttribute(name) { return attrs.has(name); },
      setAttribute(name, value) { attrs.set(name, String(value)); },
      removeAttribute(name) { attrs.delete(name); },
      get tabIndex() { return attrs.has('tabindex') ? Number(attrs.get('tabindex')) : (['A', 'BUTTON', 'INPUT'].includes(tagName) ? 0 : -1); },
      set tabIndex(value) { attrs.set('tabindex', String(value)); },
      focus(options) {
        // A plain section cannot receive focus without tabindex in a browser.
        if (this.hidden || (!['A', 'BUTTON', 'INPUT'].includes(tagName) && !attrs.has('tabindex'))) return;
        activeElement = this; this.focusOptions = options;
      },
      scrollIntoView(options) { this.scrollCount++; this.lastScroll = options; },
      getBoundingClientRect() { return { left: this.offsetLeft || 0, top: 0, width: 300, height: 450 }; },
      querySelector(selector) { return this.selectors?.[selector] || null; },
      querySelectorAll(selector) { return this.selectorLists?.[selector] || []; },
      click() { this.clickCount++; return this.fire('click'); },
    }, extra);
  }
  function attributes(tag) {
    const attrs = {};
    for (const match of tag.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)) attrs[match[1]] = match[2] ?? '';
    return attrs;
  }
  function video(id, attrs = {}) {
    const dataset = { hoverSrc: `/hover/${id}.mp4` };
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('data-')) dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    const node = element({ tagName: 'VIDEO', attributes: attrs, dataset, readyState: 0, muted: true, paused: true, playCount: 0, pauseCount: 0, loadCount: 0 });
    Object.defineProperty(node, 'src', {
      get() { return node.getAttribute('src') || ''; },
      set(value) { node.setAttribute('src', value); requests.push(value); },
    });
    Object.defineProperty(node, 'poster', {
      get() { return node.getAttribute('poster') || ''; },
      set(value) { node.setAttribute('poster', value); posterRequests.push(value); },
    });
    if (attrs.poster) posterRequests.push(attrs.poster);
    node.play = () => { node.playCount++; node.readyState = 2; node.paused = false; return Promise.resolve(); };
    node.pause = () => { node.pauseCount++; node.paused = true; };
    node.load = () => { node.loadCount++; };
    return node;
  }
  const ids = ['roadster-01', 'roadster-02'];
  const posters = ids.map(() => element({ tagName: 'A' }));
  const metrics = ids.map(() => element());
  const hoverVideos = ids.map(video);
  const cards = ids.map((id, index) => element({
    dataset: { film: id }, offsetLeft: index * 321,
    selectors: { '.av-film-open': posters[index], '[data-hover-src]': hoverVideos[index], '.av-film-metrics': metrics[index] },
  }));
  posters.forEach((poster, index) => { poster.selectors = { '[data-hover-src]': hoverVideos[index] }; });
  const notePanels = ids.map(id => {
    const tag = html.match(new RegExp(`<section\\b[^>]*data-note-panel="${id}"[^>]*>`))?.[0];
    assert.ok(tag, `the generated page must contain ${id}`);
    return element({ tagName: 'SECTION', attributes: attributes(tag), dataset: { notePanel: id },
      selectors: { '[data-gallery-item]': element({ tagName: 'A' }) } });
  });
  const tabs = ids.map(id => element({ tagName: 'BUTTON', dataset: { noteTab: id } }));
  const allNoteLinks = Array.from(html.matchAll(/<a\b[^>]*\bdata-note-link="[^"]+"[^>]*>/g), ([tag]) => {
    const attrs = attributes(tag);
    return element({ tagName: 'A', attributes: attrs, href: attrs.href,
      dataset: { noteLink: attrs['data-note-link'], noteHistory: attrs['data-note-history'], relatedNote: attrs['data-related-note'] } });
  });
  const isStoryLink = link => link.dataset.noteHistory === 'push';
  const noteLinks = allNoteLinks.filter(link => !isStoryLink(link));
  const storyLinks = allNoteLinks.filter(isStoryLink);
  const notes = element();
  const profileTag = html.match(/<a\b[^>]*data-profile-link[^>]*>/)?.[0];
  const copyTag = html.match(/<button\b[^>]*data-copy-profile[^>]*>/)?.[0];
  assert.ok(profileTag && copyTag, 'profile actions must come from the generated page');
  const profileAttrs = attributes(profileTag);
  const profile = element({ tagName: 'A', attributes: profileAttrs, href: profileAttrs.href, target: profileAttrs.target });
  const copyProfile = element({ tagName: 'BUTTON', attributes: attributes(copyTag) });
  const toast = element({ hidden: true });
  const rail = element({ scrollLeft: 0, scrollWidth: 621, clientWidth: 300,
    scrollTo(options) { this.scrollLeft = options.left; this.fire('scroll'); } });
  const railControls = element({ hidden: true }), railPrev = element(), railNext = element(), railCount = element();
  const fullVideos = ids.map(id => {
    const tag = [...html.matchAll(/<video\b[^>]*data-workflow-video[^>]*>/g)]
      .find(match => match[0].includes(`${id}-720p.mp4`))?.[0];
    assert.ok(tag, `the generated page must contain the ${id} cinema video`);
    return video(`full-${id}`, attributes(tag));
  });
  const playerToggles = ids.map(() => element({ tagName: 'BUTTON' }));
  const watchPanels = ids.map((id, index) => element({ dataset: { watchPanel: id }, hidden: true,
    selectors: { video: fullVideos[index], '[data-loading]': element({ hidden: true }), '[data-endcard]': element({ hidden: true }),
      '[data-fullscreen]': element(), '[data-player-toggle]': playerToggles[index], '.av-watch-caption h3': element({ textContent: id }) },
  }));
  const dialog = element({ open: false,
    showModal() { this.open = true; },
    close() { this.open = false; this.fire('close'); },
    selectors: { '[data-copy-announcement]': element(), '[data-cinema-close]': element({ tagName: 'BUTTON' }), '[data-cinema-title]': element() },
    selectorLists: { '[data-watch-panel]': watchPanels },
  });
  const document = element({ hidden: false, readyState, body: element(), documentElement: element({ lang: 'zh-Hans' }),
    selectors: { '[data-cinema]': dialog, '[data-toast]': toast, '#creative-notes': notes,
      '[data-profile-link]': profile, '[data-copy-profile]': copyProfile,
      '[data-film-rail]': rail, '[data-rail-controls]': railControls, '[data-rail-prev]': railPrev,
      '[data-rail-next]': railNext, '[data-rail-count]': railCount,
      ...Object.fromEntries(ids.flatMap((id, index) => [[`#${id}`, notePanels[index]], [`[data-note-panel="${id}"]`, notePanels[index]]])),
    },
    selectorLists: { '.av-film[data-film]': cards, '[data-note-tab]': tabs, '[data-note-panel]': notePanels,
      '[data-note-link]': allNoteLinks, '[data-related-note]': allNoteLinks.filter(link => link.hasAttribute('data-related-note')) },
  });
  Object.defineProperty(document, 'activeElement', { get: () => activeElement });
  const location = new URL(`https://example.test/zh/avocado-ai/index.html${initialHash}`);
  function writeHistory(mode, state, url) {
    location.href = new URL(url, location.href).href;
    history.state = state;
    historyWrites.push({ mode, state, href: location.href });
  }
  const history = { state: initialState,
    replaceState(state, _, url) { writeHistory('replace', state, url); },
    pushState(state, _, url) { writeHistory('push', state, url); },
  };
  const window = element();
  const schedule = (callback, delay = 0) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; };
  vm.runInNewContext(source, {
    document, window, location, history, URL,
    navigator: { connection: { saveData, effectiveType: '4g' }, clipboard: { writeText: async value => { copies.push(value); } } },
    matchMedia: query => element({ matches: query.includes('reduced-motion') ? reducedMotion : finePointer }),
    setTimeout: schedule, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => schedule(callback, 16), cancelAnimationFrame: id => timers.delete(id),
  });
  return { document, window, dialog, cards, posters, metrics, hoverVideos, requests, posterRequests, copies, notePanels, noteLinks, storyLinks, tabs, notes,
    profile, copyProfile, toast, location, historyWrites, fullVideos, watchPanels, playerToggles,
    get activeElement() { return activeElement; },
    installPlayers() {
      // Later defer scripts bind playback before DOMContentLoaded is dispatched.
      playerToggles.forEach((toggle, index) => toggle.addEventListener('click', () => {
        const video = fullVideos[index];
        if (video.paused) video.play();
        else video.pause();
      }));
    },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
  };
}

function visibleRecommendations(s) {
  return s.storyLinks.filter(link => !link.hidden).map(link => link.href);
}

test('creative-note links scroll to and focus the corresponding panel', () => {
  const s = setup();
  s.noteLinks[1].focus();
  assert.equal(s.noteLinks[1].fire('click').defaultPrevented, true);
  s.advance(16);
  assert.equal(s.location.hash, '#roadster-02');
  assert.equal(s.notePanels[1].hidden, false);
  assert.equal(s.notePanels[0].hidden, true);
  assert.equal(s.notePanels[1].tabIndex, -1);
  assert.equal(s.activeElement, s.notePanels[1]);
  assert.equal(s.tabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(s.notePanels[1].scrollCount, 1);
  assert.equal(s.notes.scrollCount, 0, 'the section header is above the requested film note');
  assert.deepEqual(s.historyWrites.map(write => write.mode), ['replace']);
});

test('end-of-note links create a history entry for the other film and preserve existing state', () => {
  const savedState = { reader: { from: 'portfolio' } };
  const s = setup({ initialHash: '#roadster-01', initialState: savedState });
  assert.deepEqual(s.storyLinks.map(link => link.href), ['#roadster-02', '#roadster-01']);
  assert.deepEqual(s.storyLinks.map(link => link.dataset.relatedNote), ['roadster-01', 'roadster-02']);
  assert.deepEqual(visibleRecommendations(s), ['#roadster-02']);
  const link = s.storyLinks[0];
  assert.equal(link.dataset.noteHistory, 'push');
  link.focus();
  assert.equal(link.fire('click').defaultPrevented, true);
  assert.equal(s.location.hash, '#roadster-02');
  assert.deepEqual(s.historyWrites, [{ mode: 'push', state: { reader: { from: 'portfolio' } }, href: s.location.href }]);
  assert.equal(s.activeElement, s.notePanels[1]);
  assert.equal(s.notePanels[1].hidden, false);
  assert.equal(s.notePanels[1].scrollCount, 1);
  assert.deepEqual(visibleRecommendations(s), ['#roadster-01']);
});

for (const initialHash of ['', '#selected-films']) {
  test(`continue reading from ${initialHash || 'a fragmentless entry'} preserves the first note for Back`, () => {
    const state = { reader: 'portfolio' };
    const s = setup({ initialHash, initialState: state });
    const [first, second] = s.notePanels;
    const firstURL = new URL('#roadster-01', s.location.href).href;
    const secondURL = new URL('#roadster-02', s.location.href).href;
    s.storyLinks[0].fire('click');
    const entries = [
      { mode: 'replace', href: firstURL, state: { reader: 'portfolio' } },
      { mode: 'push', href: secondURL, state: { reader: 'portfolio' } },
    ];
    assert.deepEqual(s.historyWrites, entries);
    assert.equal(s.location.href, secondURL);
    assert.equal(s.activeElement, second);
    assert.equal(first.scrollCount, 0, 'normalizing the original entry must not reposition it');
    const scrolls = [s.notes, first, second].map(node => node.scrollCount);

    const restored = s.historyWrites[0];
    s.location.href = restored.href;
    s.window.fire('popstate', { state: restored.state });
    s.window.fire('hashchange', { oldURL: secondURL, newURL: restored.href });
    s.advance(16);

    assert.equal(s.location.href, firstURL);
    assert.equal(first.hidden, false);
    assert.equal(second.hidden, true);
    assert.equal(s.tabs[0].getAttribute('aria-selected'), 'true');
    assert.equal(s.activeElement, first);
    assert.deepEqual(visibleRecommendations(s), ['#roadster-02']);
    assert.equal(first.focusOptions.preventScroll, true);
    assert.deepEqual([s.notes, first, second].map(node => node.scrollCount), scrolls);
    assert.deepEqual(s.historyWrites, entries, 'Back must not write another entry');
  });
}

test('an end-of-note action for the current URL never pushes a duplicate entry', () => {
  const s = setup({ initialHash: '#roadster-01' });
  // Fragment updates change location immediately, before the hashchange listener runs.
  s.location.hash = 'roadster-02';
  s.storyLinks[0].fire('click');
  assert.equal(s.historyWrites.some(write => write.mode === 'push'), false);
  assert.equal(s.activeElement, s.notePanels[1]);
});

test('a direct second-note URL immediately scrolls to and focuses the selected panel once', () => {
  const s = setup({ initialHash: '#roadster-02' });
  const [first, second] = s.notePanels;
  assert.equal(first.hidden, true);
  assert.equal(second.hidden, false);
  assert.equal(s.activeElement, second);
  assert.equal(second.scrollCount, 1, 'initial location synchronization must not scroll twice');
  assert.equal(second.lastScroll.behavior, 'instant');
  assert.equal(second.lastScroll.block, 'start');
  assert.deepEqual(visibleRecommendations(s), ['#roadster-01']);
  assert.equal(first.scrollCount, 0);
  assert.equal(s.notes.scrollCount, 0);
  assert.equal(s.historyWrites.length, 0);
});

test('changing the fragment by hand reveals, scrolls to and focuses the new film note', () => {
  const s = setup({ initialHash: '#roadster-01' });
  s.noteLinks[0].focus();
  const previousScrolls = s.notePanels[1].scrollCount;
  const oldURL = s.location.href;
  s.location.hash = 'roadster-02';
  s.window.fire('hashchange', { oldURL, newURL: s.location.href });
  s.advance(16);
  assert.equal(s.notePanels[0].hidden, true);
  assert.equal(s.notePanels[1].hidden, false);
  assert.equal(s.tabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(s.notePanels[1].scrollCount, previousScrolls + 1);
  assert.deepEqual(visibleRecommendations(s), ['#roadster-01']);
  assert.equal(s.activeElement, s.notePanels[1]);
  assert.equal(s.historyWrites.length, 0);
});

test('returning from a gallery state with the same note fragment preserves scroll and focus', () => {
  const s = setup();
  s.noteLinks[1].fire('click');
  s.advance(16);
  assert.equal(s.location.hash, '#roadster-02');
  const scrolls = [s.notes, ...s.notePanels].map(node => node.scrollCount);
  // Gallery history entries share the note URL. Back restores the still trigger.
  const trigger = s.notePanels[1].querySelector('[data-gallery-item]');
  trigger.focus();
  s.window.fire('popstate', { state: null });
  s.advance(16);
  assert.equal(s.activeElement, trigger);
  assert.deepEqual([s.notes, ...s.notePanels].map(node => node.scrollCount), scrolls);
  assert.equal(s.notePanels[1].hidden, false);
});

test('film-note tabs leave modified and already-handled keyboard events alone', () => {
  const s = setup();
  s.tabs[0].focus();
  for (const guard of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'defaultPrevented']) {
    let prevented = 0;
    s.tabs[0].fire('keydown', {
      key: 'ArrowRight', [guard]: true,
      preventDefault() { this.defaultPrevented = true; prevented++; },
    });
    assert.equal(prevented, 0, guard);
    assert.equal(s.activeElement, s.tabs[0], guard);
    assert.equal(s.tabs[0].getAttribute('aria-selected'), 'true', guard);
    assert.equal(s.notePanels[1].hidden, true, guard);
  }
  assert.equal(s.historyWrites.length, 0);
  assert.equal(s.tabs[0].fire('keydown', { key: 'ArrowRight' }).defaultPrevented, true);
  assert.equal(s.activeElement, s.tabs[1]);
  assert.equal(s.notePanels[1].hidden, false);
  assert.deepEqual(visibleRecommendations(s), ['#roadster-01']);
  assert.deepEqual(s.historyWrites.map(write => write.mode), ['replace']);
});

test('modified and non-primary creative-note clicks preserve native navigation and current selection', () => {
  const s = setup();
  s.noteLinks[1].focus();
  for (const detail of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
    assert.equal(s.noteLinks[1].fire('click', detail).defaultPrevented, false);
  }
  assert.equal(s.location.hash, '');
  assert.equal(s.historyWrites.length, 0);
  assert.equal(s.notePanels[0].hidden, false);
  assert.equal(s.notePanels[1].hidden, true);
  assert.equal(s.activeElement, s.noteLinks[1]);
});

test('reading film metrics or moving into the card does not load a hover movie', async () => {
  const s = setup();
  // pointerenter is dispatched to each entered ancestor, but does not bubble.
  s.cards[0].fire('pointerenter', { pointerType: 'mouse' });
  s.metrics[0].fire('pointerenter', { pointerType: 'mouse' });
  s.advance(1000); await new Promise(setImmediate);
  assert.deepEqual(s.requests, []);
  assert.equal(s.hoverVideos[0].playCount, 0);
});

test('hovering a poster loads only its muted preview and leaving the poster stops it', async () => {
  const s = setup();
  assert.deepEqual(s.requests, []);
  s.cards[1].fire('pointerenter', { pointerType: 'mouse' });
  s.posters[1].fire('pointerenter', { pointerType: 'mouse' });
  s.advance(1000); await new Promise(setImmediate);
  assert.deepEqual(s.requests, [s.hoverVideos[1].dataset.hoverSrc]);
  assert.equal(s.hoverVideos[1].muted, true);
  assert.equal(s.hoverVideos[1].playCount, 1);
  assert.equal(s.cards[1].classList.contains('has-preview'), true);
  s.posters[1].fire('pointerleave', { pointerType: 'mouse' });
  assert.equal(s.cards[1].classList.contains('has-preview'), false);
  assert.ok(s.hoverVideos[1].pauseCount > 0);
});

test('brief poster visits, touch input and resource preferences do not start a preview', async () => {
  const brief = setup();
  brief.posters[0].fire('pointerenter', { pointerType: 'mouse' });
  brief.advance(10);
  brief.posters[0].fire('pointerleave', { pointerType: 'mouse' });
  brief.advance(1000); await new Promise(setImmediate);
  assert.deepEqual(brief.requests, []);
  for (const options of [{}, { saveData: true }, { reducedMotion: true }, { finePointer: false }]) {
    const s = setup(options);
    s.posters[0].fire('pointerenter', { pointerType: Object.keys(options).length ? 'mouse' : 'touch' });
    s.advance(1000); await new Promise(setImmediate);
    assert.deepEqual(s.requests, [], JSON.stringify(options));
  }
});

test('profile copy starts hidden, appears after native navigation, and copies only on its own activation', async () => {
  const s = setup();
  assert.equal(s.copyProfile.hidden, true, 'initial visibility must come from generated markup');
  const href = s.profile.href, target = s.profile.target;
  s.profile.focus();
  assert.equal(s.profile.fire('click').defaultPrevented, false);
  assert.equal(s.copyProfile.hidden, false);
  assert.equal(s.activeElement, s.profile, 'revealing the copy action must not steal focus');
  assert.equal(s.profile.href, href);
  assert.equal(s.profile.target, target);
  assert.deepEqual(s.copies, []);
  s.copyProfile.fire('click'); await new Promise(setImmediate);
  assert.deepEqual(s.copies, [href]);
  assert.equal(s.toast.hidden, false);
  assert.match(s.toast.textContent, /复制/);
});

test('ordinary visits attach no cinema posters or movie sources', () => {
  const s = setup();
  assert.deepEqual(s.posterRequests, []);
  assert.deepEqual(s.requests, []);
  assert.equal(s.dialog.open, false);
  for (const video of s.fullVideos) {
    assert.ok(video.dataset.poster, 'the deferred poster must come from the real generated markup');
    assert.equal(video.getAttribute('poster'), null);
    assert.equal(video.getAttribute('src'), null);
  }
});

test('an initial legacy cinema deep link opens the selected film and attaches only its poster before players initialize', () => {
  const s = setup({ initialHash: '#watch-roadster-02', readyState: 'interactive' });
  assert.equal(s.dialog.open, true);
  assert.equal(s.watchPanels[1].hidden, false);
  assert.equal(s.watchPanels[0].hidden, true);
  assert.equal(s.fullVideos[1].poster, s.fullVideos[1].dataset.poster);
  assert.equal(s.fullVideos[0].getAttribute('poster'), null);
  assert.deepEqual(s.posterRequests, [s.fullVideos[1].dataset.poster]);
  assert.deepEqual(s.requests, [], 'the page controller leaves movie source selection to the player');
  assert.equal(s.activeElement, s.dialog.querySelector('[data-cinema-close]'));
  assert.equal(s.location.hash, '#watch-roadster-02');
  assert.equal(s.historyWrites.length, 0, 'restoring a deep link does not manufacture another navigation');
});

test('reduced-motion cinema deep links wait for deferred player listeners before requesting playback', async () => {
  const s = setup({ initialHash: '#watch-roadster-02', readyState: 'interactive', reducedMotion: true });
  assert.equal(s.dialog.open, true);
  assert.equal(s.playerToggles[1].clickCount, 0, 'an early synthetic click would be lost before player initialization');
  assert.equal(s.fullVideos[1].playCount, 0);
  s.installPlayers();
  s.document.fire('DOMContentLoaded');
  s.advance(1000); await new Promise(setImmediate);
  assert.equal(s.playerToggles[1].clickCount, 1);
  assert.equal(s.fullVideos[1].playCount, 1);
  assert.equal(s.fullVideos[1].muted, true);
  assert.equal(s.fullVideos[0].playCount, 0);
  assert.deepEqual(s.posterRequests, [s.fullVideos[1].dataset.poster]);
});

test('closing the initial cinema before deferred players initialize cancels the pending playback intent', async () => {
  const s = setup({ initialHash: '#watch-roadster-02', readyState: 'interactive', reducedMotion: true });
  assert.equal(s.dialog.fire('cancel').defaultPrevented, true);
  assert.equal(s.dialog.open, false);
  s.installPlayers();
  s.document.fire('DOMContentLoaded');
  s.advance(1000); await new Promise(setImmediate);
  assert.equal(s.dialog.open, false);
  assert.equal(s.fullVideos[1].playCount, 0, 'a closed viewer cannot resume in the background');
  assert.equal(s.fullVideos[0].playCount, 0);
});

test('playing the initial reduced-motion film before DOMContentLoaded is not toggled back to pause', async () => {
  const s = setup({ initialHash: '#watch-roadster-02', readyState: 'interactive', reducedMotion: true });
  s.installPlayers();
  s.playerToggles[1].click();
  const video = s.fullVideos[1];
  assert.equal(video.paused, false);
  assert.equal(video.playCount, 1);
  assert.equal(s.playerToggles[1].clickCount, 1);
  s.document.fire('DOMContentLoaded');
  s.advance(1000); await new Promise(setImmediate);
  assert.equal(s.playerToggles[1].clickCount, 1, 'the user has already fulfilled the pending play intent');
  assert.equal(video.paused, false);
  assert.equal(video.playCount, 1);
  assert.equal(video.pauseCount, 0);
});

test('playing then pausing the initial film before DOMContentLoaded preserves the explicit pause', async () => {
  const s = setup({ initialHash: '#watch-roadster-02', readyState: 'interactive', reducedMotion: true });
  s.installPlayers();
  s.playerToggles[1].click();
  s.playerToggles[1].click();
  const video = s.fullVideos[1];
  assert.equal(video.paused, true);
  assert.equal(video.playCount, 1);
  assert.equal(video.pauseCount, 1);
  assert.equal(s.playerToggles[1].clickCount, 2);
  s.document.fire('DOMContentLoaded');
  s.advance(1000); await new Promise(setImmediate);
  assert.equal(s.playerToggles[1].clickCount, 2, 'DOMContentLoaded must not override a deliberate pause');
  assert.equal(video.paused, true);
  assert.equal(video.playCount, 1);
  assert.equal(video.pauseCount, 1);
});
