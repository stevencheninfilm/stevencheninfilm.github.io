const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/viewing-links.js'), 'utf8');

function setup({ coarse = false, userAgent = 'Safari', clipboard = async () => {}, links } = {}) {
  const inserted = [];
  let observer;
  class Element {
    constructor(tag = 'a', href = '', marked = true) {
      this.tagName = tag;
      this.nodeType = 1;
      this.href = href;
      this.marked = marked;
      this.dataset = {};
      this.textContent = '新片场 ↗';
      this.attrs = new Map([['target', '_blank']]);
      this.listeners = {};
      this.children = [];
    }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    setAttribute(name, value) { this.attrs.set(name, value); }
    removeAttribute(name) { this.attrs.delete(name); }
    matches() { return this.tagName === 'a' && this.marked; }
    querySelectorAll() { return this.children.filter(child => child.matches()); }
    append(...nodes) { this.children.push(...nodes); nodes.forEach(node => { node.parentNode = this; }); }
    insertAdjacentElement(position, node) { inserted.push({ link: this, node, position }); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    focus() { this.focused = true; this.listeners.focus?.(); }
    select() { this.selected = true; }
  }
  const initial = (links || [
    ['https://www.xinpianchang.com/a13770851?from=webShare&channel=copyLink', true],
    ['https://www.bilibili.com/video/BV1muH96HER3/', true],
    ['https://www.instagram.com/pearl_steve/', false]
  ]).map(([url, marked]) => new Element('a', url, marked));
  const media = { matches: coarse, addEventListener(name, listener) { this.listener = listener; } };
  const document = {
    body: {},
    querySelectorAll() { return initial.filter(link => link.marked); },
    createElement(tag) { return new Element(tag); }
  };
  vm.runInNewContext(source, {
    window: { matchMedia: () => media },
    navigator: { userAgent, clipboard: clipboard === null ? undefined : { writeText: clipboard } },
    document,
    location: { href: 'https://stevencheninfilm.com/ai/index.html', origin: 'https://stevencheninfilm.com' },
    URL,
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} }
  });
  return { initial, inserted, media, Element, add(link) { initial.push(link); observer([{ addedNodes: [link] }]); }, repeat(link) { observer([{ addedNodes: [link] }]); } };
}

test('marked mobile viewing links use native same-tab HTTPS navigation without changing destinations', () => {
  const { initial, inserted, media } = setup({ coarse: true });
  assert.equal(initial[0].getAttribute('target'), '_self');
  assert.equal(initial[1].getAttribute('target'), '_self');
  assert.equal(initial[2].getAttribute('target'), '_blank');
  assert.equal(initial[0].href, 'https://www.xinpianchang.com/a13770851?from=webShare&channel=copyLink');
  assert.equal(initial[0].listeners.click, undefined, 'normal browser navigation is not intercepted');
  assert.equal(inserted.length, 2);
  media.matches = false;
  media.listener();
  assert.equal(initial[0].getAttribute('target'), '_blank');
});

test('desktop keeps existing navigation and in-app browsers use same-tab even with a fine pointer', () => {
  assert.equal(setup().initial[0].getAttribute('target'), '_blank');
  assert.equal(setup({ userAgent: 'Mozilla iPhone MicroMessenger/8.0' }).initial[0].getAttribute('target'), '_self');
});

test('copying writes the exact URL only after a click and reports success', async () => {
  const copied = [];
  const { initial, inserted } = setup({ clipboard: async url => copied.push(url) });
  assert.deepEqual(copied, []);
  const [button, status, input] = inserted[0].node.children[1].children;
  assert.equal(input.hidden, true);
  await button.listeners.click();
  assert.deepEqual(copied, [initial[0].href]);
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /已复制/);
  assert.equal(input.hidden, true);
  assert.equal(button.disabled, false);
});

test('clipboard denial leaves a selectable full HTTPS URL instead of pretending copy succeeded', async () => {
  for (const clipboard of [null, async () => { throw new Error('denied'); }]) {
    const { initial, inserted } = setup({ clipboard });
    const [button, status, input] = inserted[0].node.children[1].children;
    await button.listeners.click();
    assert.equal(input.value, initial[0].href);
    assert.equal(input.hidden, false);
    assert.equal(input.readOnly, true);
    assert.equal(input.focused, true);
    assert.equal(input.selected, true);
    assert.match(status.textContent, /选中/);
    assert.doesNotMatch(status.textContent, /已复制/);
  }
});

test('new film dialog links receive one set of controls; internal and non-HTTPS URLs are left alone', () => {
  const runtime = setup({ coarse: true, links: [
    ['https://stevencheninfilm.com/ai/index.html', true],
    ['mailto:hello@example.com', true],
    ['http://www.xinpianchang.com/a13770851', true]
  ] });
  assert.equal(runtime.inserted.length, 0);
  const link = new runtime.Element('a', 'https://www.xinpianchang.com/a12617120?from=UserProfile');
  runtime.add(link);
  runtime.repeat(link);
  assert.equal(runtime.inserted.length, 1);
  assert.equal(link.getAttribute('target'), '_self');
  const group = runtime.inserted[0].node;
  assert.equal(runtime.inserted[0].position, 'beforebegin');
  assert.equal(group.className, 'viewing-link-group');
  assert.equal(group.children.length, 2);
  assert.equal(group.children[0], link, 'platform link and copy controls share one layout item');
  assert.equal(group.children[1].className, 'viewing-link-tools');
  assert.equal(link.parentNode, group);
  runtime.repeat(group);
  assert.equal(runtime.inserted.length, 1, 'moving the link into its wrapper must not duplicate controls');
});
