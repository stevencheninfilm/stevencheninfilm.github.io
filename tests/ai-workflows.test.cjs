const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../assets/ai-workflows.js'), 'utf8');
function setup({ hash = '', reduced = false, compact = false } = {}) {
  let scroll = 0, sectionTop = 0, queued = [], enhanced = false;
  const eventTarget = () => ({ events: {}, addEventListener(n, fn) { this.events[n] = fn; }, fire(n, event = {}) { this.events[n]?.(event); } });
  const item = id => ({ id, attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; }, scrollIntoView() { this.scrolled = true; } });
  const items = [item('camera-previs-to-ai'), item('real-cinema-to-ai')];
  const steps = items.map(i => Object.assign(eventTarget(), item(i.id), { style: { setProperty() {} }, getAttribute: () => `#${i.id}` }));
  const counter = {};
  const pin = { offsetHeight: 900 };
  const header = { getBoundingClientRect: () => ({ height: 92 }) };
  const section = { offsetHeight: 2500, style: { setProperty() {} }, classList: { toggle(n,v) { enhanced = v; } }, getBoundingClientRect: () => ({ top: sectionTop - scroll }),
    querySelector: s => ({ '.ai-workflows__pin': pin, '[data-workflow-counter]': counter })[s], querySelectorAll: s => s === '[data-workflow-item]' ? items : steps };
  const window = Object.assign(eventTarget(), { get scrollY() { return scroll; }, scrollTo({ top }) { scroll = top; this.fire('scroll'); } });
  Object.defineProperty(window, 'scrollY', { get: () => scroll });
  const location = { hash };
  const document = { querySelector: s => s === '[data-workflows]' ? section : header };
  vm.runInNewContext(source, { window, document, location, history: { replaceState(a,b,url) { location.hash = url; } }, matchMedia: q => Object.assign(eventTarget(), { matches: q.includes('reduced') ? reduced : compact }), requestAnimationFrame: fn => { queued.push(fn); return queued.length; }, ResizeObserver: class { observe() {} } });
  const flush = () => { while (queued.length) { const next = queued; queued = []; next.forEach(fn => fn()); } };
  flush();
  return { items, steps, counter, window, location, flush, get enhanced() { return enhanced; }, scrollTo: value => { window.scrollTo({ top: value }); flush(); }, resize(height, pinHeight) { section.offsetHeight = height; pin.offsetHeight = pinHeight; window.fire('resize'); flush(); } };
}
test('scroll switches one accessible workflow at a time and reverses cleanly', () => {
  const s = setup(); assert.equal(s.items[0].inert, false); assert.equal(s.items[1].inert, true);
  s.scrollTo(900); assert.equal(s.counter.textContent, '02 / 02'); assert.equal(s.items[0].inert, true); assert.equal(s.items[1].inert, false);
  s.scrollTo(100); assert.equal(s.counter.textContent, '01 / 02'); assert.equal(s.steps[0].attrs['aria-current'], 'true');
});
test('a homepage deep link selects the second film on first load, and directory links navigate back', () => {
  const s = setup({ hash: '#real-cinema-to-ai' });
  assert.equal(s.counter.textContent, '02 / 02'); assert.equal(s.items[1].inert, false);
  s.steps[0].fire('click', { preventDefault() {} }); s.flush();
  assert.equal(s.location.hash, '#camera-previs-to-ai'); assert.equal(s.counter.textContent, '01 / 02');
});
test('resizing preserves the active story and normalized position inside the pinned section', () => {
  const s = setup(); s.scrollTo(900); s.resize(1800, 611);
  assert.equal(s.counter.textContent, '02 / 02');
  assert.ok(Math.abs(s.window.scrollY - (1800 - 611 - 100) * .6) < 1);
  s.scrollTo(2400); s.resize(2000, 700);
  assert.equal(s.window.scrollY, 2400, 'do not pull visitors back after they leave the workflow section');
});
test('reduced motion and short viewports retain both complete stories in document flow', () => {
  for (const options of [{ reduced: true }, { compact: true }]) {
    const s = setup({ ...options, hash: '#real-cinema-to-ai' });
    assert.equal(s.enhanced, false); assert.equal(s.items[0].inert, false); assert.equal(s.items[1].inert, false);
    assert.equal(s.items[0].attrs['aria-hidden'], undefined); assert.equal(s.items[1].scrolled, true);
  }
});
