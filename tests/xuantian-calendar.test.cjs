const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'projects/xuantian-jie.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/xuantian-calendar.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets/xuantian-calendar.js'), 'utf8');
const widgetHTML = html.match(/<details class="xj-calendar"[\s\S]*?<\/details>/)[0];

test('calendar is an initially closed native disclosure, with a non-modal named panel', () => {
  assert.match(widgetHTML, /^<details class="xj-calendar" data-xj-calendar>/);
  assert.match(widgetHTML, /<summary[^>]*aria-controls="xj-calendar-panel"/);
  assert.match(widgetHTML, /<aside id="xj-calendar-panel"[^>]*aria-labelledby="xj-calendar-title"/);
  assert.match(widgetHTML, /aria-label="收起追剧日历" hidden/);
  assert.doesNotMatch(widgetHTML, /aria-modal|<dialog|autofocus/);
  assert.match(html, /xuantian-calendar\.css\?v=/);
  assert.match(html, /xuantian-calendar\.js\?v=/);
  assert.match(html, /<noscript><style>[^<]*\.xj-page\.is-revealing \.xj-calendar\{opacity:1;visibility:visible;pointer-events:auto\}/);
});

test('complete supplied poster and all five release dates remain accessible', () => {
  assert.match(widgetHTML, /width="1086" height="1448" loading="lazy" decoding="async"/);
  assert.match(widgetHTML, /北京时间/);
  for (const date of ['10 月 2 日 17:30 已上线', '10 月 10 日（周六）', '10 月 17 日', '10 月 24 日', '10 月 31 日']) {
    assert.ok(widgetHTML.includes(date), date);
  }
  assert.ok(fs.statSync(path.join(root, 'assets/images/projects/xuantian-jie/release-calendar-2026-10.jpg')).size > 0);
  assert.match(widgetHTML, /class="xj-calendar__watch" href="#episode-1"/);
  assert.match(widgetHTML, /tabindex="0" role="region" aria-label="追剧日历海报，可滚动查看"/);
});

test('floating panel stays bounded and scrollable, without image crop or a full-screen overlay', () => {
  assert.match(css, /\.xj-calendar \{[^}]*position: fixed;[^}]*right:/);
  assert.match(css, /width: min\(360px, calc\(100vw - var\(--calendar-tab-width\) - 32px - env\(safe-area-inset-right\)\)\)/);
  assert.match(css, /max-height: min\(740px, calc\(100svh - 48px\)\)/);
  assert.match(css, /max-height: min\(680px, calc\(100svh - 32px\)\)/);
  assert.match(css, /\.xj-calendar__body \{[^}]*overflow-y: auto;[^}]*overscroll-behavior-y: contain/);
  assert.match(css, /\.xj-calendar__poster \{[^}]*width: 100%; height: auto/);
  assert.match(css, /\.xj-calendar:not\(\[open\]\) \.xj-calendar__panel \{ display: none; \}/);
  assert.match(css, /\.xj-page\.is-revealing \.xj-calendar \{[^}]*visibility: hidden/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /inset: 0|height: 100(?:vh|svh)|object-fit: cover/);
  assert.doesNotMatch(script, /preventDefault|stopPropagation|document\.body|showModal|localStorage|setInterval/);
});

function fixture() {
  const element = () => ({ listeners: {}, attributes: {}, hidden: true, focusCalls: 0,
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(key, value) { this.attributes[key] = value; },
    contains(target) { return target === this; },
    focus(options) { this.focusCalls++; this.focusOptions = options; }
  });
  const trigger = element(), closeButton = element(), watch = element();
  const openers = Array.from({length: 4}, element);
  const widget = { ...element(), open: false, querySelector: selector => ({ summary: trigger, '.xj-calendar__close': closeButton, '.xj-calendar__watch': watch })[selector],
    contains(target) { return [widget, trigger, closeButton, watch].includes(target); }
  };
  const document = { ...element(), activeElement: trigger, querySelector: () => widget, querySelectorAll: () => openers };
  vm.runInNewContext(script, { document });
  return {widget, trigger, closeButton, watch, document, openers};
}

test('upcoming episode cards open the existing calendar and Escape returns focus to the clicked card', () => {
  const f = fixture();
  assert.ok(f.openers.every(button => button.attributes['aria-expanded'] === 'false'));
  for (const button of f.openers) {
    button.listeners.click();
    assert.equal(f.widget.open, true);
    assert.equal(button.attributes['aria-expanded'], 'true');
    assert.equal(f.closeButton.focusOptions.preventScroll, true);
    f.document.listeners.pointerdown({target: button});
    assert.equal(f.widget.open, true, 'pressing another calendar opener must not dismiss first');
    f.document.activeElement = f.closeButton;
    f.document.listeners.keydown({key: 'Escape'});
    assert.equal(f.widget.open, false);
    assert.equal(button.focusCalls, 1);
    assert.equal(button.focusOptions.preventScroll, true);
    assert.ok(f.openers.every(item => item.attributes['aria-expanded'] === 'false'));
  }
});

test('native summary toggles synchronize card state and regain their own return-focus target', () => {
  const f = fixture();
  f.openers[0].listeners.click();
  f.trigger.listeners.click();
  f.widget.open = false;
  f.widget.listeners.toggle();
  assert.ok(f.openers.every(button => button.attributes['aria-expanded'] === 'false'));
  f.widget.open = true;
  f.widget.listeners.toggle();
  assert.ok(f.openers.every(button => button.attributes['aria-expanded'] === 'true'));
  f.closeButton.listeners.click();
  assert.equal(f.trigger.focusCalls, 1);
  assert.equal(f.openers[0].focusCalls, 0);
});

test('enhancement never auto-opens; close button and Escape restore focus without scrolling', () => {
  const f = fixture();
  assert.equal(f.widget.open, false);
  assert.equal(f.closeButton.hidden, false);
  f.widget.open = true;
  f.closeButton.listeners.click();
  assert.equal(f.widget.open, false);
  assert.equal(f.trigger.focusCalls, 1);
  assert.equal(f.trigger.focusOptions.preventScroll, true);
  f.widget.open = true;
  f.document.activeElement = f.watch;
  f.document.listeners.keydown({key: 'Escape'});
  assert.equal(f.widget.open, false);
  assert.equal(f.trigger.focusCalls, 2);
});

test('outside clicks dismiss without stealing focus, while clicks inside remain usable', () => {
  const f = fixture();
  f.widget.open = true;
  f.document.listeners.pointerdown({target: f.watch});
  assert.equal(f.widget.open, true);
  f.document.listeners.pointerdown({target: {}});
  assert.equal(f.widget.open, false);
  assert.equal(f.trigger.focusCalls, 0);
  f.widget.open = true;
  f.document.activeElement = {};
  f.document.listeners.keydown({key: 'Escape'});
  assert.equal(f.widget.open, false);
  assert.equal(f.trigger.focusCalls, 0);
});

test('respects other keyboard widgets and preserves native/modified episode navigation', () => {
  const f = fixture();
  f.widget.open = true;
  f.document.listeners.keydown({key: 'Escape', defaultPrevented: true});
  assert.equal(f.widget.open, true);
  f.document.listeners.keydown({key: 'Tab'});
  assert.equal(f.widget.open, true);
  f.watch.listeners.click({button: 0, metaKey: true});
  assert.equal(f.widget.open, true);
  f.watch.listeners.click({button: 0});
  assert.equal(f.widget.open, false);
  assert.doesNotThrow(() => vm.runInNewContext(script, {document: {querySelector: () => null}}));
});
