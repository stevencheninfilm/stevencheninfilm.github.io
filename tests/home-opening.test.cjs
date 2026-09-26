const test = require('node:test');
const assert = require('node:assert/strict');
const motion = require('../assets/home-opening-motion.js');

test('opening begins below the screen and ends registered to the real hero on desktop and mobile', () => {
  for(const [width,height,target] of [
    [1440,900,{left:15,top:15,width:1410,height:870}],
    [390,844,{left:8,top:316.8,width:374,height:210.4}]
  ]) {
    const layout=motion.geometry(width,height,target);
    const first=motion.sample(0,layout,0,0,true);
    assert.equal(first.opacity,0);
    assert.ok(first.y>height);
    const last=motion.sample(motion.timing.end,layout,0,0,true);
    for(const [key,value] of Object.entries({x:target.left,y:target.top,width:target.width,height:target.height})) {
      assert.ok(Math.abs(last[key]-value)<.001,`${width}px ${key}: ${last[key]} !== ${value}`);
    }
  }
});

test('tiles rise in sequence and form multiple columns before zooming', () => {
  const layout=motion.geometry(1440,900);
  const upper=motion.sample(1800,layout,0,-2);
  const center=motion.sample(1800,layout,0,0,true);
  assert.ok(upper.y<900 && upper.y+upper.height>0,'first image has entered');
  assert.ok(center.y>900,'lead follows the upper rows');
  const visible=[];
  for(let c=-2;c<=2;c++)for(let r=-2;r<=2;r++) {
    const f=motion.sample(2900,layout,c,r,c===0&&r===0);
    if(f.opacity && f.x<1440 && f.x+f.width>0 && f.y<900 && f.y+f.height>0)visible.push([c,r]);
  }
  assert.ok(new Set(visible.map(([c])=>c)).size>=3,'a wall, not a single image');
  assert.ok(visible.length>=6,'several rows are visible');
});

test('lead zoom is continuous and monotonic, without a size jump at the handoff', () => {
  const layout=motion.geometry(1280,800,{left:13,top:13,width:1254,height:774});
  let previous=motion.sample(motion.timing.zoomStart,layout,0,0,true);
  for(let t=motion.timing.zoomStart+16;t<=motion.timing.end;t+=16) {
    const current=motion.sample(t,layout,0,0,true);
    assert.ok(current.width>=previous.width);
    assert.ok(current.width-previous.width<20);
    assert.ok(Number.isFinite(current.x)&&Number.isFinite(current.y));
    previous=current;
  }
});
