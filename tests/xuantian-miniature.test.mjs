import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Vector3,Raycaster,BufferGeometry,Float32BufferAttribute} from '../assets/vendor/three-0.160.0/three.module.js';
import {createXuantianSect,XUANTIAN_FEATURES} from '../projects/xuantian-map/xuantian-tile.mjs';
import {SECT_SCALE,SECT_BLEND_RADIUS,sectCore,sectInfluence,sectLocalHeight,sectHeight,ridgeHeight,carveSectStream,STREAM_PATHS,STREAM_CURVES,streamLevel,streamMeshData} from '../projects/xuantian-map/xuantian-landscape.mjs';
import {createSectStream} from '../projects/xuantian-map/xuantian-water.mjs';
import {RADIUS,corners,makeTiles,worldPoint,regions,classify,normalized} from '../projects/xuantian-map/world.mjs';

const {group,features,update}=createXuantianSect();
const center=worldPoint(regions.xuantian.u,regions.xuantian.v),tiles=makeTiles();
const height=(x,z)=>sectHeight(x,z,.42,center,.42);
test('continuous sect constructs without DOM, image assets or network dependency',()=>{
 assert.equal(group.name,'xuantian-continuous-sect');assert.equal(group.userData.footprint,'multi-cell');
 assert.equal(group.userData.terrain,'shared-heightfield');
 assert.equal(features.length,12);assert.doesNotThrow(()=>update(123));
 group.traverse(o=>{if(o.isMesh)assert.equal(o.material.map,null);});
});
test('refined geometry is finite, batched and explicitly extends beyond one hex',()=>{
 let vertices=0;const v=new Vector3();let outside=0;
 group.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
   v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
   assert.ok(Number.isFinite(v.x+v.y+v.z),o.name+' invalid vertex');
   if(Math.hypot(v.x,v.z)>RADIUS)outside++;vertices++;
  }
 });
 assert.ok(vertices>1200000,'detailed roofs, windows and foliage are geometry');
 assert.ok(vertices<3000000,'bounded detail budget including refined bridges and shrine wings');assert.ok(group.children.length<32,'material batching');
 assert.ok(outside>vertices*.65,'no single-hex clipping');
 const code=fs.readFileSync(new URL('../projects/xuantian-map/xuantian-tile.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/insideHex|hex-bevel|hex-base/);
});
test('original regional position supports a multi-cell complex and wider continuous foothills',()=>{
 const core=tiles.filter(t=>sectCore(t.x-center.x,t.z-center.z));
 const affected=tiles.filter(t=>sectInfluence(t.x-center.x,t.z-center.z)>0);
 assert.equal(core.length,21);assert.ok(affected.length>350);
 const gate=features.find(f=>f.name==='山门'),hall=features.find(f=>f.name==='玄天殿');
 assert.ok(gate.z-hall.z>RADIUS*4);
 assert.ok(Math.max(...core.map(t=>t.x))-Math.min(...core.map(t=>t.x))>RADIUS*6);
 assert.ok(sectInfluence(9,0)>.8);assert.equal(sectInfluence(SECT_BLEND_RADIUS,0),0);
 for(const [x,z]of [[31,0],[-32,0],[0,31],[27,27]])assert.equal(sectHeight(center.x+x,center.z+z,2.123,center,.42),2.123);
 assert.ok(sectInfluence(-17,-14)>.25,'farther foothills retain visible influence');
 for(const [x,z]of [[-16,-25],[23,-25],[-20,12],[24,10]])assert.ok(ridgeHeight(x,z)>2,'ridge continues into the wider range');
 const outer=sectHeight(center.x-18,center.z-10,6,center,.42);
 assert.ok(outer>=6,'outer integration never shaves down the pre-existing mountains');
});
test('neighboring hexes sample exactly the same elevated edge in either winding',()=>{
 let checked=0;const edgeMap=new Map();
 for(const tile of tiles.filter(t=>sectInfluence(t.x-center.x,t.z-center.z)>.1)){
  const ring=corners(tile.x,tile.z);
  for(let i=0;i<6;i++){
   const a=ring[i],b=ring[(i+1)%6],p=[a,b].sort((p,q)=>p.x-q.x||p.z-q.z);
   const key=p.map(v=>v.x.toFixed(5)+','+v.z.toFixed(5)).join('|');
   const samples=Array.from({length:13},(_,j)=>height(p[0].x+(p[1].x-p[0].x)*j/12,p[0].z+(p[1].z-p[0].z)*j/12));
   if(edgeMap.has(key)){samples.forEach((v,j)=>assert.ok(Math.abs(v-edgeMap.get(key)[j])<1e-7));checked++;}
   else edgeMap.set(key,samples);
  }
 }
 assert.ok(checked>200);
 for(let a=0;a<Math.PI*2;a+=.15){
  const h=sectHeight(center.x+Math.cos(a)*(SECT_BLEND_RADIUS-1e-4),center.z+Math.sin(a)*(SECT_BLEND_RADIUS-1e-4),.42,center,.42);
  assert.ok(Math.abs(h-.42)<1e-8);
 }
});
test('reference courts ascend on a connected rock-cut axis, not floating platforms',()=>{
 const axis=['山门','内门','通玄天阶','天衡台','玄天殿'].map(name=>XUANTIAN_FEATURES.find(f=>f.name===name));
 assert.ok(axis.every(f=>f.x===0));
 for(let i=1;i<axis.length;i++){assert.ok(axis[i].y>axis[i-1].y);assert.ok(axis[i].z<axis[i-1].z);}
 for(let i=0;i<=40;i++){
  const z=2.46-i/40*2.73,step=1.8+i/40*2.8,ground=sectLocalHeight(0,z);
  assert.ok(ground<step+.04&&ground>step-.20,'stair contacts ridge: '+ground+' / '+step);
 }
 for(const name of ['祖师殿','藏经阁','剑院','丹院','药园'])assert.ok(XUANTIAN_FEATURES.some(f=>f.name===name));
 for(const name of ['内门','天衡台','玄天殿','祖师殿','藏经阁','剑院','丹院']){
  const f=XUANTIAN_FEATURES.find(f=>f.name===name),gap=f.y-sectLocalHeight(f.x,f.z);
  assert.ok(gap>-.01&&gap<.23,name+' is supported by shared terrain');
 }
 assert.equal(group.children.filter(m=>m.name==='waterfall').length,6);
});
test('river flows downhill across cells into existing lake, above a carved bed',()=>{
 let last=Infinity;
 for(let i=0;i<=100;i++){const y=streamLevel(i/100,.42);assert.ok(y<=last);last=y;}
 for(const [branch,path]of STREAM_PATHS.entries())for(let i=0;i<path.length;i++){
  const [x,z]=path[i],progress=i/(path.length-1)*(branch===0?1:.5);
  const water=streamLevel(progress,.42),bed=carveSectStream(center.x+x*SECT_SCALE,center.z+z*SECT_SCALE,1,center,.42);
  assert.ok(bed<water-.02,'water above carved bed');
 }
 const end=STREAM_PATHS[0].at(-1),uv=normalized(center.x+end[0]*SECT_SCALE,center.z+end[1]*SECT_SCALE);
 assert.equal(classify(uv.u,uv.v).type,'water');
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(streamMeshData(.42),3));g.computeVertexNormals();
 const normals=g.attributes.normal;for(let i=0;i<normals.count;i++)assert.ok(normals.getY(i)>.9,'upward water faces at bends');
});
test('roof stays pickable and keeps upward winding at actual map scale',()=>{
 const ray=new Raycaster(new Vector3(0,20,6.65*SECT_SCALE),new Vector3(0,-1,0));
 assert.ok(ray.intersectObject(group,true).length);
 const roof=group.children.find(o=>o.name==='miniature-roof');assert.ok(roof);
 const n=roof.geometry.attributes.normal;let up=0;for(let i=0;i<n.count;i++)if(n.getY(i)>.3)up++;
 assert.ok(up>n.count*.30);
});
test('spline streams have smooth tangents, variable width, and no exposed dry bed',()=>{
 let min=Infinity,max=0;
 for(const curve of STREAM_CURVES){
  assert.ok(curve.length>120);
  for(let i=0;i<curve.length;i++){
   const p=curve[i];min=Math.min(min,p.width);max=Math.max(max,p.width);
   if(i)assert.ok(p.nx*curve[i-1].nx+p.nz*curve[i-1].nz>Math.cos(.15),'no sharp river kink');
   for(const u of [-1,0,1]){
    const width=p.width*(u<0?p.left:p.right),x=(p.x+p.nx*width*u)*SECT_SCALE,z=(p.z+p.nz*width*u)*SECT_SCALE;
    const bed=carveSectStream(x,z,sectLocalHeight(x/SECT_SCALE,z/SECT_SCALE)*SECT_SCALE,{x:0,z:0},.54*SECT_SCALE);
    assert.ok(bed<streamLevel(p.progress,.54*SECT_SCALE),'full curved width submerged');
   }
  }
 }
 assert.ok(min>.15&&max<.36);assert.ok(max/min>1.4);
 assert.equal(STREAM_CURVES[1].at(-1).progress,STREAM_CURVES[0][160].progress);
});
test('river banks, per-vertex depth colors and animated flow are genuine geometry',()=>{
 const groundAt=(x,z)=>carveSectStream(x,z,sectLocalHeight(x/SECT_SCALE,z/SECT_SCALE)*SECT_SCALE,{x:0,z:0},.54*SECT_SCALE);
 const stream=createSectStream({base:.54*SECT_SCALE,groundAt});
 assert.equal(stream.group.children.length,2);
 const water=stream.group.getObjectByName('spline-water'),banks=stream.group.getObjectByName('wet-river-banks');
 assert.ok(water.geometry.attributes.uv.count>10000);assert.ok(water.material.vertexColors);
 for(const m of [water,banks]){
  assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));
  const n=m.geometry.attributes.normal;for(let i=0;i<n.count;i++)assert.ok(n.getY(i)>0);
 }
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};
 water.material.onBeforeCompile(shader);stream.update(12);assert.equal(shader.uniforms.uStreamTime.value,12);
});
test('outlying shrines rest above their sampled hillside footprint',()=>{
 assert.equal(group.userData.shrines.length,4);
 const heights=[];
 for(const p of group.userData.shrines){
  heights.push(p.y);
  for(const dx of [-1.15,0,1.15])for(const dz of [-.85,0,.85])assert.ok(p.y>sectLocalHeight(p.x+dx*p.scale,p.z+dz*p.scale));
 }
 assert.ok(Math.max(...heights)-Math.min(...heights)>.5,'shrines are not on a common flat plane');
});
test('atlas integration keeps multi-cell picking and regional inspection',()=>{
 const js=fs.readFileSync(new URL('../projects/xuantian-map/map.js',import.meta.url),'utf8');
 const html=fs.readFileSync(new URL('../projects/xuantian-map/index.html',import.meta.url),'utf8');
 for(const token of [
  "if(place.id==='xuantian')continue",
  'xuantianModel.group.position.set(xuantianPlace.x,miniatureBase,xuantianPlace.z)',
  'userData.tileIds=xuantianCoreTiles.map',
  'intersectObjects([terrain,xuantianModel.group,sectStream],true)',
  'tileAt(intersection.point.x,intersection.point.z)',
  "neighbor===tile||neighbor.type==='water'",
  'const EDGE_STEPS=12','distance<9?20:distance<27?8:2',
  "get('focus')==='xuantian'",'shadowCamera.updateProjectionMatrix'
 ])assert.ok(js.includes(token),token);
 assert.ok(html.includes('id="inspect-xuantian"'));assert.doesNotMatch(html,/单格微缩/);
});
