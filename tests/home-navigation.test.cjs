const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../assets/site.js'), 'utf8');

function homepage() {
  const timers = new Map(), frames = new Map();
  let nextTask = 1, now = 100;
  const document = { documentElement: { lang: 'en' }, hidden: false, activeElement: null };
  function element(classes = []) {
    const names = new Set(classes), listeners = new Map(), attributes = new Map(), properties = new Map();
    const el = {
      dataset: {}, tabIndex: 0,
      classList: {
        contains: name => names.has(name),
        add: (...values) => values.forEach(value => names.add(value)),
        remove: (...values) => values.forEach(value => names.delete(value)),
        toggle(name, enabled) { if (enabled) names.add(name); else names.delete(name); }
      },
      style: { setProperty(name, value) { properties.set(name, value); }, getPropertyValue: name => properties.get(name) },
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: name => attributes.get(name),
      removeAttribute: name => attributes.delete(name),
      querySelectorAll: () => [], querySelector: () => null,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
      addEventListener(type, callback, options) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push({ callback, capture: options === true || options?.capture });
      },
      async fire(type, event) {
        const handlers = [...(listeners.get(type) || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
        const pending = [];
        for (const { callback } of handlers) {
          if (event.immediateStopped) break;
          pending.push(callback(event));
        }
        await Promise.all(pending);
      },
      focus() { document.activeElement = el; },
      closest: () => null,
      animate: () => ({ finished: Promise.resolve(), cancel() {} }),
      remove() {},
    };
    return el;
  }
  const deck = element(), pagination = element(), dock = element(), current = element();
  const previous = element(), next = element(), loader = element(), loaderPercent = element();
  const cards = Array.from({ length: 4 }, (_, index) => {
    const card = element(['deck-card', 'deck-card--comparison']);
    card.dataset = { page: String(index - 1), title: `Project ${index}` };
    return card;
  });
  const thumbs = cards.map((_, index) => {
    const thumb = element();
    thumb.dataset.slide = String(index);
    thumb.closest = selector => selector === '[data-slide]' ? thumb : null;
    return thumb;
  });
  const links = cards.map(card => ({ closest: selector => selector === '.deck-card' ? card : null }));
  document.body = element();
  document.querySelector = selector => ({
    '.project-deck': deck, '.home-pagination': pagination, '.thumbnail-dock': dock,
    '#current-slide': current, '.site-loader': loader, '.loader-percent': loaderPercent,
    '.stage-step--prev': previous, '.stage-step--next': next
  })[selector];
  document.querySelectorAll = selector => ({ '.deck-card': cards, '[data-slide]': thumbs, '.stage-step': [previous, next] })[selector] || [];
  document.addEventListener = element().addEventListener;
  const window = element();
  Object.assign(window, {
    innerWidth: 1280, location: { search: '' },
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    setTimeout(callback) { const id = nextTask++; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id)
  });
  const captures = new Set();
  deck.setPointerCapture = id => captures.add(id);
  deck.hasPointerCapture = id => captures.has(id);
  deck.releasePointerCapture = id => {
    captures.delete(id);
    deck.fire('lostpointercapture', { pointerId: id });
  };
  vm.runInNewContext(source, {
    document, window, URLSearchParams,
    sessionStorage: { getItem: () => 'seen' }, performance: { now: () => now },
    requestAnimationFrame(callback) { const id = nextTask++; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id)
  });
  const event = extra => ({
    target: links[0], pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0,
    clientX: 200, clientY: 200, detail: 1, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
    stopImmediatePropagation() { this.stopped = this.immediateStopped = true; }, ...extra
  });
  const settle = async () => {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
      for (const [id, callback] of [...frames]) { frames.delete(id); callback(now += 16); }
    }
  };
  return {
    document, deck, window, dock, cards, thumbs, links, current, pagination, captures, event, settle,
    async key(index, key, extra = {}) {
      const e = event({ target: thumbs[index], key, ...extra });
      const pending = dock.fire('keydown', e);
      if (!e.stopped) await window.fire('keydown', e);
      await pending;
      return e;
    },
    async pointer(type, extra = {}) { const e = event(extra); await deck.fire(type, e); return e; },
    active: () => thumbs.findIndex(thumb => thumb.getAttribute('aria-pressed') === 'true')
  };
}

test('dock keyboard selection follows focus with one tab stop and native Enter activation', async () => {
  const app = homepage();
  assert.deepEqual(app.thumbs.map(thumb => thumb.tabIndex), [0, -1, -1, -1]);
  app.thumbs[0].focus();
  const right = await app.key(0, 'ArrowRight');
  assert.equal(right.defaultPrevented, true);
  assert.equal(right.stopped, true, 'the global project shortcut must not run twice');
  assert.equal(app.active(), 1);
  assert.equal(app.document.activeElement, app.thumbs[1]);
  assert.deepEqual(app.thumbs.map(thumb => thumb.tabIndex), [-1, 0, -1, -1]);
  const enter = await app.key(1, 'Enter', { detail: 0 });
  assert.equal(enter.defaultPrevented, false, 'Enter retains native button activation');
  await app.thumbs[1].fire('click', app.event({ target: app.thumbs[1], detail: 0 }));
  assert.equal(app.active(), 1, 'Enter cannot activate the previously focused project');
});

test('dock Home/End and arrow wrapping focus the correct first and last project', async () => {
  const app = homepage();
  app.thumbs[0].focus();
  await app.key(0, 'End');
  assert.equal(app.active(), 3);
  assert.equal(app.document.activeElement, app.thumbs[3]);
  await app.key(3, 'ArrowRight');
  assert.equal(app.active(), 0);
  assert.equal(app.document.activeElement, app.thumbs[0]);
  await app.key(0, 'ArrowLeft');
  assert.equal(app.active(), 3);
  await app.key(3, 'Home');
  assert.equal(app.active(), 0);
  assert.equal(app.document.activeElement, app.thumbs[0]);
  assert.equal((await app.key(0, 'End', { ctrlKey: true })).defaultPrevented, false);
  assert.equal((await app.key(0, 'ArrowRight', { shiftKey: true })).defaultPrevented, false);
  assert.equal(app.active(), 0, 'browser modifier shortcuts do not switch projects');
});

test('a keyboard transition never pulls focus back after the user tabs away', async () => {
  const app = homepage();
  app.thumbs[0].focus();
  const pending = app.key(0, 'ArrowRight');
  const outside = {};
  app.document.activeElement = outside;
  await pending;
  assert.equal(app.active(), 1);
  assert.equal(app.document.activeElement, outside);
});

test('a swipe across a project link switches once and suppresses only its resulting pointer click', async () => {
  const app = homepage();
  await app.pointer('pointerdown');
  await app.pointer('pointerup', { clientX: 100 });
  await app.settle();
  assert.equal(app.active(), 1);
  const click = await app.pointer('click');
  assert.equal(click.defaultPrevented, true, 'the old project link cannot open after a swipe');
  assert.equal(click.immediateStopped, true);
  const keyboardClick = await app.pointer('click', { detail: 0 });
  assert.equal(keyboardClick.defaultPrevented, false);
  await app.pointer('pointerdown', { target: app.links[1], pointerId: 2 });
  await app.pointer('pointerup', { target: app.links[1], pointerId: 2 });
  const nextTap = await app.pointer('click', { target: app.links[1], pointerId: 2 });
  assert.equal(nextTap.defaultPrevented, false, 'a fresh native tap is never swallowed');
});

test('native taps, modifier clicks and context-button gestures do not become project swipes', async () => {
  for (const extra of [{}, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { pointerType: 'mouse', button: 2 }]) {
    const app = homepage();
    await app.pointer('pointerdown', extra);
    await app.pointer('pointerup', { ...extra, clientX: Object.keys(extra).length ? 100 : 198 });
    await app.settle();
    assert.equal(app.active(), 0);
    assert.equal((await app.pointer('click', extra)).defaultPrevented, false);
  }
});

test('legacy synthesized clicks without a useful pointer ID still cannot activate a swiped link', async () => {
  for (const pointerId of [undefined, 0, -1]) {
    const app = homepage();
    await app.pointer('pointerdown', { pointerId: 4 });
    await app.pointer('pointerup', { pointerId: 4, clientX: 100 });
    await app.settle();
    assert.equal((await app.pointer('click', { pointerId })).defaultPrevented, true);
  }
});

test('lost capture, cancellation and window exit reset a strip drag without expanding it', async () => {
  for (const type of ['lostpointercapture', 'pointercancel', 'blur', 'pagehide']) {
    const app = homepage();
    await app.pagination.fire('click', app.event());
    await app.settle();
    assert.equal(app.deck.classList.contains('is-strip'), true);
    await app.pointer('pointerdown');
    await app.pointer('pointermove', { clientX: 80 });
    assert.equal(app.deck.classList.contains('is-dragging'), true);
    if (type === 'lostpointercapture' || type === 'pointercancel') await app.pointer(type);
    else await app.window.fire(type, {});
    await app.pointer('pointerup', { clientX: 80 });
    await app.settle();
    assert.equal(app.deck.classList.contains('is-dragging'), false, type);
    assert.equal(app.captures.size, 0, type);
    assert.equal(app.deck.classList.contains('is-strip'), true, `${type} must not become a click-to-expand`);
  }
});

test('releasing an expanded pointer outside the deck cannot lock later swipes', async () => {
  const app = homepage();
  await app.pointer('pointerdown');
  await app.window.fire('pointerup', app.event({ clientX: 20 }));
  await app.pointer('pointerdown', { pointerId: 2 });
  await app.pointer('pointerup', { pointerId: 2, clientX: 100 });
  await app.settle();
  assert.equal(app.active(), 1);
});
