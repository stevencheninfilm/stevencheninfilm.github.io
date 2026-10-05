import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RADIUS,regions,types,makeTiles,corners,worldPoint,normalized,classify} from '../projects/xuantian-map/world.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const tiles=makeTiles();
test('world is deterministic, finite, and contains five landmarks and all biomes',()=>{
 assert.deepEqual(makeTiles(),tiles);assert.equal(new Set(tiles.map(t=>t.id)).size,tiles.length);
 assert.ok(tiles.length>1200&&tiles.length<1500);
 for(const t of tiles){assert.ok(Number.isFinite(t.x)&&Number.isFinite(t.z));assert.ok(types[t.type]);assert.ok(regions[t.region]);}
 for(const type of Object.keys(types))assert.ok(tiles.some(t=>t.type===type),type);
 assert.equal(Object.values(regions).filter(r=>r.u!==undefined).length,5);
});
test('each tile is a regular hexagon with equal edges and exact shared vertices',()=>{
 for(const t of tiles){const points=corners(t.x,t.z);assert.equal(points.length,6);for(let i=0;i<6;i++){
  assert.ok(Math.abs(Math.hypot(points[i].x-t.x,points[i].z-t.z)-RADIUS)<1e-10);
  assert.ok(Math.abs(Math.hypot(points[i].x-points[(i+1)%6].x,points[i].z-points[(i+1)%6].z)-RADIUS)<1e-10);
 }}
 const a=tiles.find(t=>t.col===21&&t.row===16),b=tiles.find(t=>t.col===22&&t.row===16);
 assert.equal(corners(a.x,a.z).filter(p=>corners(b.x,b.z).some(q=>Math.hypot(p.x-q.x,p.z-q.z)<1e-9)).length,2);
});
test('reference map geography retains four corners, central academy, lake and southern sea',()=>{
 for(const [id,r] of Object.entries(regions).filter(([,r])=>r.u!==undefined))assert.equal(classify(r.u,r.v).region,id);
 assert.ok(regions.xuantian.u<.5&&regions.xuantian.v<.5);
 assert.ok(regions.tianyan.u>.5&&regions.tianyan.v<.5);
 assert.ok(regions.diyuan.u<.5&&regions.diyuan.v>.5);
 assert.ok(regions.huangting.u>.5&&regions.huangting.v>.5);
 assert.equal(classify(.33,.455).type,'water');assert.equal(classify(.49,.85).type,'water');
 for(const r of Object.values(regions).filter(r=>r.u!==undefined)){const p=worldPoint(r.u,r.v),n=normalized(p.x,p.z);assert.ok(Math.abs(n.u-r.u)<1e-10&&Math.abs(n.v-r.v)<1e-10);}
});
test('map is independent, locally vendored, reachable from project and has accessible controls',()=>{
 const html=read('projects/xuantian-map/index.html');
 assert.match(read('projects/xuantian-jie.html'),/href="xuantian-map\/"/);
 assert.match(html,/name="viewport"/);assert.match(html,/prefers|map.css/);
 for(const id of ['home','zoom-in','zoom-out','tilt','grid','borders','labels','help','minimap','close-selection'])assert.match(html,new RegExp(`id="${id}"`));
 for(const file of ['map.css','map.js','world.mjs'])assert.ok(fs.existsSync(path.join(root,'projects/xuantian-map',file)));
 for(const file of ['three.module.js','OrbitControls.js','LICENSE'])assert.ok(fs.existsSync(path.join(root,'assets/vendor/three-0.160.0',file)));
 assert.doesNotMatch(html,/<script[^>]*src="https?:/);
 assert.match(html,/import\('\.\/map.js\?v=\d+'\)\.catch/);
});
test('renderer has actual elevated geometry, picking, touch and reduced-motion safeguards',()=>{
 const script=read('projects/xuantian-map/map.js');
 for(const token of ['BufferGeometry','relief(x,z)','InstancedMesh','Raycaster','intersection.faceIndex','THREE.TOUCH.PAN','webglcontextlost','visibilitychange','prefers-reduced-motion'])assert.ok(script.includes(token),token);
 assert.match(read('projects/xuantian-map/map.css'),/\[hidden\]\{display:none!important\}/);
 assert.match(script,/aVolcano/);assert.match(script,/vVolcano/);
 assert.doesNotMatch(script,/localStorage|fetch\(/);
});
