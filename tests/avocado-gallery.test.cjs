const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/avocado-gallery.js'), 'utf8');

function setup() {
  let activeElement = null, now = 0, timerId = 0;
  const timers = new Map(), requests = [], tasks = [], notifications = [];
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
        for (const callback of listeners.get(type) || []) callback(event);
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
  for (const name of ['retry', 'direct']) parts[name].closest = () => parts[name];
  const dialog = element({
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; tasks.push(() => this.fire('close')); },
    querySelector(selector) { return parts[selector.match(/^\[data-lightbox-(.+)\]$/)?.[1]]; },
  });
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
  class PendingImage {
    set src(url) { this.url = url; requests.push(this); }
    succeed() { this.onload?.(); }
    fail() { this.onerror?.(); }
  }
  vm.runInNewContext(source, {
    document, window, Image: PendingImage, URL, Event: class { constructor(type) { this.type = type; } },
    location: { href: 'https://example.test/zh/avocado-ai/index.html' },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { ...parts, dialog, links, requests, notifications, classes, window,
    get activeElement() { return activeElement; },
    open(index) { links[index].focus(); return links[index].fire('click'); },
    key(key) { return dialog.fire('keydown', { key }); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
    },
    flushClose() { while (tasks.length) tasks.shift()(); },
    lastRequest() { return requests.at(-1); },
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
  assert.equal(s.image.src, s.links[1].href);
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
  assert.equal(s.image.src, s.links[1].href);
  assert.equal(s.caption.textContent, 'Still roadster-b');
  assert.equal(s.count.textContent, '02 / 03');
  assert.equal(s.image.hidden, false);
  assert.equal(s.error.hidden, true);
  assert.equal(s.loading.hidden, true);
});

test('closing while loading restores the trigger focus and ignores delayed callbacks, including after another gallery opens', () => {
  const s = setup(); s.open(0); const old = s.lastRequest();
  s.close.fire('click');
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
  assert.equal(s.image.src, s.links[3].href);
  assert.equal(s.count.textContent, '01 / 02');
  assert.equal(s.dialog.fire('cancel').defaultPrevented, true);
  s.flushClose();
  assert.equal(s.activeElement, s.links[3]);
});

test('keyboard navigation respects each gallery boundary and exposes disabled endpoint controls', () => {
  const s = setup(); s.open(1);
  assert.equal(s.key('Home').defaultPrevented, true);
  assert.equal(s.prev.disabled, true);
  assert.equal(s.next.disabled, false);
  s.key('ArrowLeft'); s.lastRequest().succeed();
  assert.equal(s.image.src, s.links[0].href);
  s.key('End'); s.lastRequest().succeed();
  assert.equal(s.image.src, s.links[2].href);
  assert.equal(s.prev.disabled, false);
  assert.equal(s.next.disabled, true);
  s.key('ArrowRight'); s.lastRequest().succeed();
  assert.equal(s.image.src, s.links[2].href, 'the last Roadster still must not advance into Tesla');
  s.key('ArrowLeft'); s.lastRequest().succeed();
  assert.equal(s.image.src, s.links[1].href);
  assert.equal(s.key('Tab').defaultPrevented, false, 'native dialog focus navigation must remain intact');
  s.close.fire('click'); s.flushClose();
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
  assert.equal(s.image.src, retry.url);
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
  assert.equal(s.image.src, s.links[2].href);
  assert.equal(s.next.disabled, true);
  down(); up({ clientX: 230 }); s.lastRequest().succeed();
  assert.equal(s.image.src, s.links[1].href);
});
