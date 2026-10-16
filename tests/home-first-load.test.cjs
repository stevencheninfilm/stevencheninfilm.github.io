const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('homepage works without startup scripts and defers inactive full-resolution artwork',()=>{
  const html=read('index.html');
  assert.equal(html,read('index-v3.html'));
  assert.doesNotMatch(html.match(/<body[^>]*>/)[0],/is-loading|is-v3-loading/);
  assert.match(html,/<div class="v3-loader" hidden/);
  const cards=[...html.matchAll(/<article class="deck-card\b[\s\S]*?<\/article>/g)].map(m=>m[0]);
  assert.equal(cards.length,7);
  for(const card of cards.slice(1)){
    assert.doesNotMatch(card,/(?<!data-)\b(?:src|srcset)="/);
    assert.match(card,/data-src="/);
  }
  assert.match(cards[0],/poster="assets\/images\/home\/grand-theft-art-poster.jpg"/);
  assert.match(html,/<a[^>]*href="about.html"/);
  for(const script of html.matchAll(/<script[^>]*\bsrc="[^"]+"[^>]*>/g)) assert.match(script[0],/\bdefer\b/);
});
test('selecting a lazy project hydrates all artwork and responsive sources only once',async()=>{
  let decodes=0;
  const image=src=>({dataset:{src},removeAttribute(name){if(name==='data-src')delete this.dataset.src;},decode(){decodes++;return Promise.resolve();}});
  const images=[image('/hero.jpg'),image('/logo.png')];
  const source={dataset:{srcset:'/mobile.jpg'},removeAttribute(){delete this.dataset.srcset;}};
  const card={dataset:{},querySelector:()=>null,querySelectorAll:selector=>selector.startsWith('img')?images:[source]};
  const code=read('assets/site.js').match(/const ensureCardMedia = \(index\) => \{[\s\S]*?\n  \};/)[0];
  const load=vm.runInNewContext(`${code};ensureCardMedia`,{cards:[card]});
  assert.equal(images[0].src,undefined);
  await load(0);assert.equal(images[0].src,'/hero.jpg');assert.equal(images[1].src,'/logo.png');
  assert.equal(source.srcset,'/mobile.jpg');assert.equal(decodes,2);
  await load(0);assert.equal(decodes,2);
  await load(999);
});
