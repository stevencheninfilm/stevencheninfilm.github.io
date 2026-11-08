const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/avocado-gallery.js'), 'utf8');

function setup({ initialState = null, initialURL = 'https://example.test/zh/avocado-ai/index.html' } = {}) {
  let activeElement = null, now = 0, timerId = 0;
  const timers = new Map(), requests = [], decoders = [], tasks = [], notifications = [];
  const objectURLs = new Map(), revoked = new Set();
  function element(extra = {}) {
    const listeners = new Map();
    return Object.assign({
      hidden: false, disabled: false, isConnected: true, textContent: '', dataset: {}, captures: [],
      addEventListener(name, callback) {
        const callbacks = listeners.get(name) || [];
        callbacks.push(callback); listeners.set(name, callbacks);
      },
      fire(type, detail = {}) {
        const event = Object.assign({ type, target: this, button: 0, defaultPrevented: false,
          preventDefault() { this.defaultPrevented = true; } }, detail);
        return this.dispatch(event);
      },
      dispatch(event) {
        for (const callback of listeners.get(event.type) || []) callback(event);
        this.parent?.dispatch(event);
        return event;
      },
      focus() { activeElement = this; },
      removeAttribute(name) { delete this[name]; },
      setPointerCapture(id) { this.captures.push(id); },
      closest() { return null; },
    }, extra);
  }
  const parts = Object.fromEntries(['image', 'title', 'caption', 'count', 'loading', 'error', 'direct', 'prev', 'next', 'close', 'stage', 'retry']
    .map(name => [name, element({ hidden: ['loading', 'error'].includes(name) })]));
  parts.progress = element(); parts.percent = element();
  parts.image.naturalWidth = 1600; parts.image.naturalHeight = 900;
  parts.image.getBoundingClientRect = () => ({ left: 20, top: 40, width: 1000, height: 800 });
  for (const name of ['retry', 'direct']) parts[name].closest = () => parts[name];
  const dialog = element({
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; tasks.push(() => this.fire('close')); },
    querySelector(selector) { return parts[selector.match(/^\[data-lightbox-(.+)\]$/)?.[1]]; },
  });
  parts.stage.parent = dialog;
  const links = ['roadster-a', 'roadster-b', 'roadster-c', 'tesla-a', 'tesla-b'].map(name => element({
    href: `https://example.test/stills/${name}.webp`,
    dataset: { gallery: name.split('-')[0], galleryTitle: name.startsWith('roadster') ? 'Roadster' : 'Tesla', caption: `Still ${name}` },
  }));
  const classes = new Set();
  const document = {
    body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
    querySelector: selector => selector === '[data-lightbox]' ? dialog : null,
    querySelectorAll: selector => selector === '[data-gallery-item]' ? links : [],
    dispatchEvent: event => notifications.push(event.type),
  };
  const window = element();
  const location = new URL(initialURL), historyTasks = [];
  const entries = [{ state: structuredClone(initialState), url: location.href }];
  let historyIndex = 0;
  const history = {
    get state() { return entries[historyIndex].state; },
    get length() { return entries.length; },
    pushState(state, unused, url) {
      const entry = { state: structuredClone(state), url: new URL(url, location.href).href };
      entries.splice(historyIndex + 1); entries.push(entry); historyIndex++;
      location.href = entry.url;
    },
    replaceState(state, unused, url) {
      entries[historyIndex] = { state: structuredClone(state), url: new URL(url, location.href).href };
      location.href = entries[historyIndex].url;
    },
    back() { this.go(-1); },
    forward() { this.go(1); },
    go(delta) {
      historyTasks.push(() => {
        const next = historyIndex + delta;
        if (next < 0 || next >= entries.length) return;
        historyIndex = next; location.href = entries[historyIndex].url;
        window.fire('popstate', { state: this.state });
      });
    },
  };
  class ImageURL extends URL {
    static createObjectURL(blob) {
      const url = `blob:still-${objectURLs.size + 1}`;
      objectURLs.set(url, blob); return url;
    }
    static revokeObjectURL(url) { revoked.add(url); }
  }
  class PendingImage {
    set src(url) { this.url = url; if (url) decoders.push(this); }
    succeed() { this.onload?.(); }
    fail() { this.onerror?.(); }
  }
  class Request {
    open(method, url) { this.method = method; this.url = url; }
    send() { requests.push(this); }
    abort() { this.aborted = true; this.onabort?.(); }
    progress(loaded, total) { this.onprogress?.({ loaded, total: total ?? 0, lengthComputable: Number.isFinite(total) }); }
    succeed({ status = 200, size = 100, decode = true } = {}) {
      this.status = status; this.response = { size, networkURL: this.url };
      const before = decoders.length;
      this.onload?.();
      if (decode && decoders.length > before) decoders.at(-1).succeed();
    }
    fail() { this.onerror?.(); }
  }
  vm.runInNewContext(source, {
    document, window, Image: PendingImage, XMLHttpRequest: Request, URL: ImageURL, Event: class { constructor(type) { this.type = type; } },
    location, history,
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { ...parts, dialog, links, requests, decoders, revoked, objectURLs, notifications, classes, window, history, location,
    get activeElement() { return activeElement; },
    open(index) { links[index].focus(); return links[index].fire('click'); },
    key(key) { return dialog.fire('keydown', { key }); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
    flushClose() { while (tasks.length) tasks.shift()(); },
    flushHistory() { while (historyTasks.length) historyTasks.shift()(); },
    settle() {
      while (historyTasks.length || tasks.length) {
        while (historyTasks.length) historyTasks.shift()();
        while (tasks.length) tasks.shift()();
      }
    },
    lastRequest() { return requests.at(-1); },
    shownURL() { return objectURLs.get(parts.image.src)?.networkURL; },
  };
}

test('full-size stills load only after an ordinary click, and only the selected still is requested', () => {
  const s = setup();
  assert.equal(s.requests.length, 0, 'initial page rendering must not fetch full images');
  for (const detail of [{ metaKey: true }, { ctrlKey: true }, { button: 1 }]) {
    assert.equal(s.links[1].fire('click', detail).defaultPrevented, false, 'native open-in-new-tab remains available');
  }
  assert.equal(s.requests.length, 0);
  assert.equal(s.open(1).defaultPrevented, true);
  assert.equal(s.requests.length, 1);
  assert.equal(s.lastRequest().url, s.links[1].href);
  assert.equal(s.dialog.open, true);
  assert.equal(s.activeElement, s.close);
  assert.deepEqual(s.notifications, ['avocado:galleryopen']);
  assert.equal(s.count.textContent, '02 / 03');
  assert.equal(s.loading.hidden, true);
  s.advance(250); assert.equal(s.loading.hidden, false);
  s.lastRequest().succeed();
  assert.equal(s.shownURL(), s.links[1].href);
  assert.equal(s.image.alt, 'Still roadster-b');
  assert.equal(s.image.hidden, false);
  assert.equal(s.loading.hidden, true);
  assert.equal(s.requests.length, 1, 'success must not prefetch neighboring stills');
});

test('a slow previous selection cannot overwrite a newer image or show a stale error', () => {
  const s = setup(); s.open(0);
  const old = s.lastRequest();
  s.next.fire('click');
  const current = s.lastRequest(); current.succeed();
  old.succeed(); old.fail(); s.advance(1000);
  assert.equal(s.shownURL(), s.links[1].href);
  assert.equal(s.caption.textContent, 'Still roadster-b');
  assert.equal(s.count.textContent, '02 / 03');
  assert.equal(s.image.hidden, false);
  assert.equal(s.error.hidden, true);
  assert.equal(s.loading.hidden, true);
});

test('closing while loading restores the trigger focus and ignores delayed callbacks, including after another gallery opens', () => {
  const s = setup(); s.open(0); const old = s.lastRequest();
  s.close.fire('click');
  s.flushHistory();
  assert.equal(old.aborted, true);
  assert.equal(s.dialog.open, false);
  assert.equal(s.activeElement, s.links[0]);
  assert.equal(s.classes.has('av-lightbox-open'), false);
  old.succeed(); old.fail(); s.advance(1000);
  assert.equal(s.dialog.open, false);
  assert.equal(s.image.src, undefined);
  assert.equal(s.image.hidden, true);
  assert.equal(s.error.hidden, true);
  assert.equal(s.loading.hidden, true);
  s.open(3); const current = s.lastRequest();
  s.flushClose(); // Native close is queued; it may arrive after another modal session begins.
  assert.equal(s.classes.has('av-lightbox-open'), true, 'an earlier close must not unlock the newly opened viewer');
  assert.equal(s.activeElement, s.close);
  old.succeed(); old.fail();
  assert.equal(s.image.hidden, true);
  assert.equal(s.error.hidden, true);
  current.succeed();
  assert.equal(s.shownURL(), s.links[3].href);
  assert.equal(s.count.textContent, '01 / 02');
  assert.equal(s.dialog.fire('cancel').defaultPrevented, true);
  s.settle();
  assert.equal(s.activeElement, s.links[3]);
});

test('keyboard navigation respects each gallery boundary and exposes disabled endpoint controls', () => {
  const s = setup(); s.open(1);
  assert.equal(s.key('Home').defaultPrevented, true);
  assert.equal(s.prev.disabled, true);
  assert.equal(s.next.disabled, false);
  s.key('ArrowLeft'); s.lastRequest().succeed();
  assert.equal(s.shownURL(), s.links[0].href);
  s.key('End'); s.lastRequest().succeed();
  assert.equal(s.shownURL(), s.links[2].href);
  assert.equal(s.prev.disabled, false);
  assert.equal(s.next.disabled, true);
  s.key('ArrowRight');
  assert.equal(s.shownURL(), s.links[2].href, 'the last Roadster still must not advance into Tesla');
  s.key('ArrowLeft'); s.lastRequest().succeed();
  assert.equal(s.shownURL(), s.links[1].href);
  assert.equal(s.key('Tab').defaultPrevented, false, 'native dialog focus navigation must remain intact');
  s.close.fire('click'); s.settle();
  const loaded = s.requests.length;
  assert.equal(s.key('ArrowRight').defaultPrevented, false);
  assert.equal(s.requests.length, loaded, 'closed dialogs cannot navigate');
});

test('a failed image offers a direct URL and retries only that still with a fresh request', () => {
  const s = setup(); s.open(4); s.lastRequest().fail();
  assert.equal(s.error.hidden, false);
  assert.equal(s.loading.hidden, true);
  assert.equal(s.image.hidden, true);
  assert.equal(s.direct.href, s.links[4].href);
  s.retry.fire('click');
  assert.equal(s.requests.length, 2);
  const retry = s.lastRequest(), url = new URL(retry.url);
  assert.equal(url.pathname, new URL(s.links[4].href).pathname);
  assert.ok(url.searchParams.has('retry'));
  assert.equal(s.direct.href, retry.url);
  assert.equal(s.error.hidden, true);
  retry.succeed();
  assert.equal(s.image.hidden, false);
  assert.equal(s.shownURL(), retry.url);
  assert.equal(s.count.textContent, '02 / 02');
});

test('touch swipes change one still while vertical gestures, cancellation, and non-primary pointers do not', () => {
  const s = setup(); s.open(1);
  const down = (detail = {}) => s.stage.fire('pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: 150, clientY: 100, ...detail });
  const up = (detail = {}) => s.stage.fire('pointerup', { pointerId: 7, clientX: 70, clientY: 105, ...detail });
  const originalRequests = s.requests.length;
  down(); up({ clientY: 200 });
  down(); s.stage.fire('pointercancel'); up();
  down({ isPrimary: false }); up();
  down({ pointerType: 'mouse' }); up();
  assert.equal(s.requests.length, originalRequests);
  const captures = s.stage.captures.length;
  for (const target of [s.retry, s.direct]) { down({ target }); up(); }
  assert.equal(s.stage.captures.length, captures, 'touching error controls must not capture their click onto the swipe stage');
  assert.equal(s.requests.length, originalRequests, 'error controls are not swipe targets');
  down(); up(); s.lastRequest().succeed();
  assert.equal(s.shownURL(), s.links[2].href);
  assert.equal(s.next.disabled, true);
  down(); up({ clientX: 230 }); s.lastRequest().succeed();
  assert.equal(s.shownURL(), s.links[1].href);
});

test('download progress uses measured bytes, remains indeterminate without a length, and waits for decode', () => {
  const s = setup(); s.open(0); const request = s.lastRequest();
  s.advance(250);
  assert.equal(s.loading.hidden, false);
  assert.equal(s.progress.value, undefined, 'no invented zero-percent estimate before the server supplies a length');
  assert.equal(s.percent.textContent, '');
  request.progress(250, 1000);
  assert.equal(s.progress.value, 25);
  assert.equal(s.percent.textContent, '25%');
  request.progress(1000, 1000);
  request.succeed({ decode: false });
  assert.equal(s.progress.value, 100);
  assert.equal(s.image.hidden, true);
  assert.equal(s.loading.hidden, false, 'a downloaded image may still need decoding');
  s.decoders.at(-1).succeed();
  assert.equal(s.image.hidden, false);
  assert.equal(s.loading.hidden, true);

  s.next.fire('click'); s.advance(250);
  s.lastRequest().progress(700, null);
  assert.equal(s.progress.value, undefined);
  assert.equal(s.percent.textContent, '');
  assert.equal(s.loading.hidden, false);
  request.progress(1000, 1000);
  assert.equal(s.progress.value, undefined, 'an old transfer cannot overwrite the new image progress');
});

test('switching, closing and page exit abort pending transfers and release every decoded image URL', () => {
  const s = setup(); s.open(0); const old = s.lastRequest();
  s.next.fire('click');
  assert.equal(old.aborted, true);
  old.succeed();
  assert.equal(s.objectURLs.size, 0, 'a stale download must not allocate a blob URL');

  s.lastRequest().succeed({ decode: false });
  const decoder = s.decoders.at(-1), staleDecode = decoder.onload, firstURL = decoder.url;
  s.next.fire('click');
  assert.equal(s.revoked.has(firstURL), true, 'an abandoned decode must release its blob');
  staleDecode();
  assert.equal(s.image.hidden, true);
  s.lastRequest().succeed();
  const displayedURL = s.image.src;
  assert.equal(s.revoked.has(displayedURL), false, 'the displayed object URL stays valid until leaving the image');
  s.close.fire('click'); s.settle();
  assert.equal(s.revoked.has(displayedURL), true);
  assert.equal(s.image.src, undefined);

  s.open(3); const pending = s.lastRequest();
  s.window.fire('pagehide');
  assert.equal(pending.aborted, true);
  assert.equal(s.dialog.open, false);
});

test('HTTP, empty-file, timeout and decode failures leave a working retry without leaking image URLs', () => {
  for (const failure of ['http', 'empty', 'timeout', 'decode']) {
    const s = setup(); s.open(0);
    const request = s.lastRequest();
    if (failure === 'http') request.succeed({ status: 404 });
    if (failure === 'empty') request.succeed({ size: 0 });
    if (failure === 'timeout') request.ontimeout();
    if (failure === 'decode') { request.succeed({ decode: false }); s.decoders.at(-1).fail(); }
    assert.equal(s.error.hidden, false, failure);
    assert.equal(s.loading.hidden, true, failure);
    assert.equal(s.image.hidden, true, failure);
    for (const url of s.objectURLs.keys()) assert.ok(s.revoked.has(url), failure);
    s.retry.fire('click'); s.lastRequest().succeed();
    assert.equal(s.image.hidden, false, failure);
    assert.equal(s.error.hidden, true, failure);
  }
});

test('only actual contain margins and dialog padding dismiss the image, while picture and controls stay open', () => {
  const s = setup();
  const click = (target, clientX, clientY) => s.dialog.fire('click', { target, clientX, clientY });
  s.open(0); s.lastRequest().succeed();
  // Landscape image fits across the 1000px box, with letterboxing above and below.
  click(s.image, 500, 400);
  assert.equal(s.dialog.open, true);
  click(s.retry, 100, 100); click(s.direct, 100, 100);
  assert.equal(s.dialog.open, true, 'controls never count as the dark backdrop');
  click(s.image, 500, 80);
  s.flushHistory();
  assert.equal(s.dialog.open, false, 'the image element includes a top margin that is not picture content');
  assert.equal(s.activeElement, s.links[0]); s.flushClose();

  s.open(1); s.lastRequest().succeed();
  s.image.naturalWidth = 800; s.image.naturalHeight = 1600;
  click(s.image, 500, 400);
  assert.equal(s.dialog.open, true);
  click(s.image, 50, 400);
  s.flushHistory();
  assert.equal(s.dialog.open, false, 'portrait images leave clickable side margins'); s.flushClose();
  s.open(0); s.lastRequest().succeed();
  click(s.dialog, 5, 5);
  s.flushHistory();
  assert.equal(s.dialog.open, false, 'outer dialog padding is also a dismiss area');
});

test('swipes, cancelled gestures and dragging back to the start cannot accidentally dismiss via a synthetic click', () => {
  const s = setup(); s.open(0); s.lastRequest().succeed();
  const down = (x = 500, y = 400) => s.stage.fire('pointerdown', { pointerType: 'touch', isPrimary: true, pointerId: 7, clientX: x, clientY: y });
  const move = (x, y) => s.stage.fire('pointermove', { pointerId: 7, clientX: x, clientY: y });
  const up = (x, y) => s.stage.fire('pointerup', { pointerId: 7, clientX: x, clientY: y });
  const click = (x, y) => s.dialog.fire('click', { target: s.stage, clientX: x, clientY: y });
  s.stage.fire('pointerdown', { pointerType: 'mouse', isPrimary: true, pointerId: 3, clientX: 500, clientY: 400 });
  s.dialog.fire('pointerup', { pointerId: 3, clientX: 5, clientY: 5 });
  s.dialog.fire('click', { target: s.dialog, clientX: 5, clientY: 5 });
  assert.equal(s.dialog.open, true, 'dragging the picture into outer dialog padding must not close it');
  down(); up(400, 400);
  assert.equal(s.count.textContent, '02 / 03');
  click(400, 400); // The replacement is still loading, so every stage pixel is blank.
  assert.equal(s.dialog.open, true);
  s.lastRequest().succeed();
  down(500, 80); move(520, 80); up(500, 80); click(500, 80);
  assert.equal(s.dialog.open, true, 'returning to the same coordinate does not erase a drag');
  down(500, 80); s.stage.fire('pointercancel'); click(500, 80);
  assert.equal(s.dialog.open, true);
  down(500, 80);
  s.stage.fire('pointerdown', { pointerType: 'touch', isPrimary: false, pointerId: 8, clientX: 520, clientY: 80 });
  up(500, 80); click(500, 80);
  assert.equal(s.dialog.open, true, 'a multi-touch gesture is not a dismiss tap');
  down(500, 80); up(500, 80); click(500, 80);
  s.flushHistory();
  assert.equal(s.dialog.open, false, 'a later deliberate tap on the margin still closes');
});

test('clamped endpoint navigation preserves both an in-flight request and a displayed image', () => {
  const s = setup(); s.open(0); const first = s.lastRequest();
  for (const key of ['ArrowLeft', 'Home', 'ArrowLeft']) s.key(key);
  assert.equal(s.requests.length, 1);
  assert.equal(first.aborted, undefined, 'holding the previous key must not starve the first image download');
  first.succeed(); const shown = s.image.src;
  s.key('Home');
  assert.equal(s.image.src, shown);
  assert.equal(s.image.hidden, false);
  assert.equal(s.revoked.has(shown), false);
  assert.equal(s.requests.length, 1);
  s.key('End'); const last = s.lastRequest();
  s.key('ArrowRight'); s.key('End');
  assert.equal(s.requests.length, 2);
  assert.equal(last.aborted, undefined);
  last.fail(); s.retry.fire('click');
  assert.equal(s.requests.length, 3, 'explicit retry still reloads the current image');
});

test('Back closes only the gallery and Forward restores its current group and still without changing notes or other state', () => {
  const state = { note: 'roadster-02', scroll: { y: 1420 }, anotherFeature: true };
  const url = 'https://example.test/zh/avocado-ai/index.html?ref=portfolio#roadster-02';
  const s = setup({ initialState: state, initialURL: url });
  s.open(3); s.next.fire('click'); s.lastRequest().succeed();
  assert.equal(s.history.length, 2, 'moving between images must not add history entries');
  assert.equal(s.location.href, url);
  for (const key of Object.keys(state)) assert.deepEqual(s.history.state[key], state[key]);
  const shown = s.image.src;
  s.history.back(); s.settle();
  assert.equal(s.dialog.open, false);
  assert.equal(s.revoked.has(shown), true);
  assert.equal(s.activeElement, s.links[3]);
  assert.deepEqual(s.history.state, state);
  assert.equal(s.location.href, url);
  const requests = s.requests.length;
  s.history.forward(); s.settle();
  assert.equal(s.dialog.open, true);
  assert.equal(s.count.textContent, '02 / 02');
  assert.equal(s.requests.length, requests + 1);
  assert.equal(s.lastRequest().url, s.links[4].href);
  assert.equal(s.history.length, 2, 'Forward restores rather than pushes a new gallery entry');
  assert.equal(s.location.href, url);
  s.dialog.fire('cancel'); s.settle();
  assert.equal(s.dialog.open, false);
  assert.equal(s.activeElement, s.links[4], 'a restored session returns to the restored still thumbnail');
  assert.deepEqual(s.history.state, state);
});

test('duplicate close and reopening before Back completes cannot consume another history entry or lose the new session', () => {
  const s = setup({ initialState: { preserved: 'base' } });
  s.open(0); const old = s.lastRequest();
  s.close.fire('click'); s.close.fire('click'); s.dialog.fire('cancel');
  assert.equal(s.dialog.open, true, 'the background stays inert until browser traversal completes');
  s.next.fire('click');
  assert.equal(s.requests.length, 1, 'selection changes are ignored while closing');
  s.open(3); s.open(4);
  assert.equal(s.requests.length, 1, 'only the final queued opening is loaded after Back');
  s.flushHistory();
  assert.equal(old.aborted, true);
  assert.equal(s.dialog.open, true);
  assert.equal(s.lastRequest().url, s.links[4].href);
  assert.equal(s.requests.length, 2);
  assert.equal(s.history.length, 2);
  s.flushClose(); old.succeed(); old.fail();
  assert.equal(s.classes.has('av-lightbox-open'), true, 'late close and image callbacks cannot clear the replacement session');
  s.lastRequest().succeed();
  assert.equal(s.shownURL(), s.links[4].href);
  s.close.fire('click'); s.settle();
  assert.deepEqual(s.history.state, { preserved: 'base' });
  assert.equal(s.dialog.open, false);
  s.history.forward(); s.settle();
  assert.equal(s.count.textContent, '02 / 02');
});

test('opening another group while the viewer is already open reuses its one history layer', () => {
  const s = setup(); s.open(0); const pending = s.lastRequest();
  s.open(4); s.flushClose();
  assert.equal(pending.aborted, true);
  assert.equal(s.history.length, 2);
  assert.equal(s.dialog.open, true);
  assert.equal(s.count.textContent, '02 / 02');
  assert.equal(s.lastRequest().url, s.links[4].href);
  s.close.fire('click'); s.settle();
  assert.equal(s.history.state, null);
  s.history.forward(); s.settle();
  assert.equal(s.count.textContent, '02 / 02');
  assert.equal(s.history.length, 2);
});

test('leaving the page cleans up without traversing history, and a saved session restores on BFCache return or reload', () => {
  const s = setup({ initialState: { note: 'roadster-02' }, initialURL: 'https://example.test/en/avocado-ai/index.html#roadster-02' });
  s.open(4); const pending = s.lastRequest(), savedState = structuredClone(s.history.state);
  s.window.fire('pagehide'); s.settle();
  assert.equal(s.dialog.open, false);
  assert.equal(pending.aborted, true);
  assert.deepEqual(s.history.state, savedState, 'page exit must not call Back');
  assert.equal(s.history.length, 2);
  s.window.fire('pageshow', { persisted: true }); s.settle();
  assert.equal(s.dialog.open, true);
  assert.equal(s.lastRequest().url, s.links[4].href);
  assert.equal(s.history.length, 2);

  const reloaded = setup({ initialState: savedState, initialURL: s.location.href });
  assert.equal(reloaded.dialog.open, true);
  assert.equal(reloaded.requests.length, 1);
  assert.equal(reloaded.lastRequest().url, reloaded.links[4].href);
  assert.equal(reloaded.history.length, 1, 'initial state recovery does not manufacture an entry');
  reloaded.close.fire('click'); reloaded.settle();
  assert.equal(reloaded.dialog.open, false, 'a browser session restored without a predecessor must still close');
  assert.deepEqual(reloaded.history.state, { note: 'roadster-02' });
  assert.equal(reloaded.location.href, s.location.href);
  const invalid = setup({ initialState: { avocadoGallery: { version: 1, entry: 'bad', group: 'unknown', index: 999 } } });
  assert.equal(invalid.dialog.open, false);
  assert.equal(invalid.requests.length, 0, 'history cannot name images outside the existing gallery links');
});
