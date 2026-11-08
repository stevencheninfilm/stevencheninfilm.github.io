const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/viewing-links.js'), 'utf8');

function setup({ coarse = false, userAgent = 'Safari', clipboard = async () => {}, links, storage = new Map(), language = 'zh-Hans', linkLanguage } = {}) {
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
    closest() { return this.contextLanguage ? { getAttribute: () => this.contextLanguage } : null; }
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
  ]).map(([url, marked]) => Object.assign(new Element('a', url, marked), { contextLanguage: linkLanguage }));
  const media = { matches: coarse, addEventListener(name, listener) { this.listener = listener; } };
  const document = {
    body: {},
    documentElement: { lang: language },
    querySelectorAll() { return initial.filter(link => link.marked); },
    createElement(tag) { return new Element(tag); }
  };
  vm.runInNewContext(source, {
    window: { matchMedia: () => media },
    navigator: { userAgent, clipboard: clipboard === null ? undefined : { writeText: clipboard } },
    sessionStorage: storage === null ? {
      getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }
    } : { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
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
  let prevented = false;
  initial[0].listeners.click({ preventDefault() { prevented = true; } });
  assert.equal(prevented, false, 'normal browser navigation is not intercepted');
  assert.equal(inserted.length, 2);
  media.matches = false;
  media.listener();
  assert.equal(initial[0].getAttribute('target'), '_blank');
});

test('desktop keeps existing navigation and in-app browsers use same-tab even with a fine pointer', () => {
  assert.equal(setup().initial[0].getAttribute('target'), '_blank');
  assert.equal(setup({ userAgent: 'Mozilla iPhone MicroMessenger/8.0' }).initial[0].getAttribute('target'), '_self');
});

test('copy tools appear only for the activated viewing link and do not copy automatically', () => {
  const copied = [];
  const { initial, inserted } = setup({ clipboard: url => copied.push(url) });
  const firstTools = inserted[0].node.children[1];
  const secondTools = inserted[1].node.children[1];
  assert.equal(firstTools.hidden, true);
  assert.equal(secondTools.hidden, true);
  initial[0].listeners.click();
  assert.equal(firstTools.hidden, false);
  assert.equal(secondTools.hidden, true);
  assert.deepEqual(copied, []);
  const css = fs.readFileSync(path.join(__dirname, '../assets/media-access.css'), 'utf8');
  assert.match(css, /\.viewing-link-tools\[hidden\][^{]*\{\s*display:\s*none;/);
});

test('same-tab return and later film dialogs remember the activated URL for this session', () => {
  const storage = new Map();
  const firstPage = setup({ coarse: true, storage });
  firstPage.initial[0].listeners.click();
  const returnPage = setup({ coarse: true, storage });
  assert.equal(returnPage.inserted[0].node.children[1].hidden, false);
  assert.equal(returnPage.inserted[1].node.children[1].hidden, true);
  const duplicate = new returnPage.Element('a', firstPage.initial[0].href);
  returnPage.add(duplicate);
  assert.equal(returnPage.inserted[2].node.children[1].hidden, false);
  assert.equal(setup().inserted[0].node.children[1].hidden, true, 'a new session starts hidden');
});

test('middle-click reveals tools and unavailable storage never blocks activation', () => {
  const { initial, inserted } = setup({ storage: null });
  const tools = inserted[0].node.children[1];
  initial[0].listeners.auxclick({ button: 2 });
  assert.equal(tools.hidden, true);
  initial[0].listeners.auxclick({ button: 1 });
  assert.equal(tools.hidden, false);
  assert.doesNotThrow(() => initial[0].listeners.click());
});

test('copying writes the exact URL only after a click and reports success', async () => {
  const copied = [];
  const { initial, inserted } = setup({ clipboard: async url => copied.push(url) });
  assert.deepEqual(copied, []);
  const [button, status, input] = inserted[0].node.children[1].children;
  assert.equal(input.hidden, true);
  initial[0].listeners.click();
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
    initial[0].listeners.click();
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
  assert.equal(group.children[1].hidden, true);
  link.listeners.click();
  assert.equal(group.children[1].hidden, false);
  assert.equal(link.parentNode, group);
  runtime.repeat(group);
  assert.equal(runtime.inserted.length, 1, 'moving the link into its wrapper must not duplicate controls');
});

test('English copy actions stay hidden until activation and report success in English', async () => {
  const s = setup({ language: 'en-US' });
  const tools = s.inserted[0].node.children[1];
  const [button, status, input] = tools.children;
  assert.equal(tools.lang, 'en');
  assert.equal(tools.hidden, true);
  assert.equal(button.textContent, 'Copy link');
  assert.match(button.getAttribute('aria-label'), /: Copy link$/);
  assert.equal(input.getAttribute('aria-label'), 'Video link for manual copying');
  s.initial[0].listeners.click();
  await button.listeners.click();
  assert.equal(tools.hidden, false);
  assert.equal(status.textContent, 'Link copied. Paste it into your browser to open.');
  assert.equal(input.hidden, true);
});

test('English clipboard failure exposes a selectable URL with English recovery guidance', async () => {
  const s = setup({ language: 'en', clipboard: null });
  const [button, status, input] = s.inserted[0].node.children[1].children;
  s.initial[0].listeners.click();
  await button.listeners.click();
  assert.equal(status.textContent, 'Select and copy the link below.');
  assert.equal(input.value, s.initial[0].href);
  assert.equal(input.hidden, false);
  assert.equal(input.focused, true);
  assert.equal(input.selected, true);
});

test('a viewing link uses its nearest explicit language before the document language', () => {
  const s = setup({ language: 'en', linkLanguage: 'zh-Hans' });
  const tools = s.inserted[0].node.children[1];
  assert.equal(tools.lang, 'zh-Hans');
  assert.equal(tools.children[0].textContent, '复制链接');
});
