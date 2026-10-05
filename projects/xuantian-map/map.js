import * as THREE from 'three';
import { OrbitControls } from '../../assets/vendor/three-0.160.0/OrbitControls.js';
import { RADIUS,WIDTH,DEPTH,regions,types,labels,random,worldPoint,normalized,makeTiles,corners } from './world.mjs';
import { createXuantianSect } from './xuantian-tile.mjs?v=4';
import {createSectStream} from './xuantian-water.mjs';
import {SECT_SCALE,sectCore,sectInfluence,sectHeight,carveSectStream,streamSample} from './xuantian-landscape.mjs';

const $=s=>document.querySelector(s);
const stage=$('#map-stage');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const mobile=()=>innerWidth<=760;
const tiles=makeTiles();
const scene=new THREE.Scene();
scene.background=new THREE.Color('#b9c8b9');
scene.fog=new THREE.Fog('#b9c8b9',105,195);
const camera=new THREE.PerspectiveCamera(39,innerWidth/innerHeight,.035,300);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.06;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label','玄天决仙界地图：六边形地貌与五处宗门地标');
stage.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight('#e5efd9','#3b4e47',1.6));
const sunlight=new THREE.DirectionalLight('#ffdfaa',2.6);
sunlight.position.set(-45,75,30);sunlight.castShadow=true;
sunlight.shadow.mapSize.set(2048,2048);
Object.assign(sunlight.shadow.camera,{left:-70,right:70,top:55,bottom:-55,near:1,far:160});
sunlight.shadow.bias=-.0006;sunlight.shadow.normalBias=.09;
scene.add(sunlight);
const fill=new THREE.DirectionalLight('#b9dded',.65);fill.position.set(30,15,-45);scene.add(fill);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.09;
controls.minDistance=3.4;controls.maxDistance=145;
controls.minPolarAngle=.12;controls.maxPolarAngle=1.23;
controls.screenSpacePanning=false;controls.panSpeed=.8;controls.rotateSpeed=.5;controls.zoomSpeed=.8;
controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};
controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_ROTATE};
const world=new THREE.Group();scene.add(world);
const landmarkPoints=Object.entries(regions).filter(([,r])=>r.u!==undefined).map(([id,r])=>({id,...r,...worldPoint(r.u,r.v)}));
// Restore the original regional position and multi-cell footprint. Architecture
// and the neighboring map now use one continuous height field, not a hex stand.
const xuantianPlace=landmarkPoints.find(p=>p.id==='xuantian');
const xuantianTile=tiles.reduce((best,t)=>Math.hypot(t.x-xuantianPlace.x,t.z-xuantianPlace.z)<Math.hypot(best.x-xuantianPlace.x,best.z-xuantianPlace.z)?t:best,tiles[0]);
const xuantianCoreTiles=tiles.filter(t=>sectCore(t.x-xuantianPlace.x,t.z-xuantianPlace.z));

// Spatially bucketed peaks: adjacent hexes sample the same relief field.
const buckets=new Map();
const peakKey=(x,z)=>`${Math.floor(x/5)},${Math.floor(z/5)}`;
for(const tile of tiles) {
 if(!['mountain','snow','volcanic','mesa'].includes(tile.type))continue;
 if(random(tile.col+213,tile.row+63)<.21)continue;
 const amount=tile.type==='mesa'?1:2;
 for(let j=0;j<amount;j++) {
  const seed=tile.col*193+tile.row*719+j*19;
  const peak={x:tile.x+(random(seed)-.5)*1.6,z:tile.z+(random(seed,1)-.5)*1.6,
   height:(tile.type==='mesa'?.8:tile.type==='volcanic'?1.8:2)+random(seed,2)*(tile.type==='mesa'?1.6:3.5),radius:1.7+random(seed,3)*1.2};
  if(landmarkPoints.some(p=>p.id!=='tianyan'&&Math.hypot(p.x-peak.x,p.z-peak.z)<(p.id==='academy'?5:4.5)))continue;
  const key=peakKey(peak.x,peak.z);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(peak);
 }
}
function baseHeight(x,z){return .42+.11*Math.sin(x*.42)*Math.cos(z*.62)+.07*Math.sin(x*1.7+z*.9);}
const sectBase=baseHeight(xuantianPlace.x,xuantianPlace.z);
const miniatureBase=sectBase-.54*SECT_SCALE;
const heightCache=new Map();
function relief(x,z){
 // Numeric keys avoid allocating strings for every repeated triangle sample.
 // This atlas stays well inside +/-100 units; the packed integer is exact.
 const key=(Math.round(x*1e5)+1e7)*2e7+Math.round(z*1e5)+1e7;
 if(heightCache.has(key))return heightCache.get(key);
 let h=0;const bx=Math.floor(x/5),bz=Math.floor(z/5);
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of buckets.get(`${bx+dx},${bz+dz}`)||[]){
  const d=Math.hypot((x-p.x)*.73,z-p.z)/p.radius;
  if(d<1)h=Math.max(h,p.height*Math.pow(1-d,1.18)*(1+.095*Math.sin(x*5+z*3.7)+.07*Math.cos(z*7-x*2)));
 }
 const height=carveSectStream(x,z,sectHeight(x,z,baseHeight(x,z)+h,xuantianPlace,sectBase),xuantianPlace,sectBase);
 heightCache.set(key,height);return height;
}
const tileAt=(x,z)=>{
 let best=null,d=Infinity;
 for(const t of tiles){const n=(t.x-x)**2+(t.z-z)**2;if(n<d){d=n;best=t;}}
 return best;
};
const elevation=(x,z)=>{const t=tileAt(x,z);return t?.type==='water'?.13:relief(x,z);};
const positions=[],colors=[],lavaMask=[],terrainTriangles=[];
const tmpColor=new THREE.Color();
function colorVertex(tile,x,z,h){
 const base=tmpColor.set(types[tile.type].color);
 const n=random(Math.round(x*20),Math.round(z*20));
 if(h>1.25&&tile.type!=='water'){
  base.lerp(new THREE.Color(tile.type==='volcanic'?'#424849':tile.type==='mesa'?'#a48b69':'#949b96'),Math.min(.9,(h-1)/2));
  if((tile.type==='snow'&&h>2.7)||(tile.type==='mountain'&&h>4.5))base.lerp(new THREE.Color('#edece0'),Math.min(.85,(h-2.7)*.25));
 }
 base.multiplyScalar(.87+n*.21);
 const blend=sectInfluence(x-xuantianPlace.x,z-xuantianPlace.z);
 if(blend>0&&tile.type!=='water'){
  const slope=Math.hypot(relief(x+.035,z)-relief(x-.035,z),relief(x,z+.035)-relief(x,z-.035))/.07;
  const local=new THREE.Color('#677a50').lerp(new THREE.Color('#939589'),THREE.MathUtils.smoothstep(slope,.5,2.4));
  local.multiplyScalar(.93+n*.12);base.lerp(local,blend);
 }
 return [base.r,base.g,base.b];
}
function triangle(tile,a,b,c,side=false){
 // XZ polygon winding is reversed so normals point toward the sky.
 for(const p of [a,c,b]){positions.push(p.x,p.y,p.z);const color=colorVertex(tile,p.x,p.z,p.y);colors.push(...color.map(v=>v*(side?.67:1)));lavaMask.push(['volcanic','ash'].includes(tile.type)?1:0);}
 terrainTriangles.push(tile);
}
const gridPoints=[],borderPoints=[];
const EDGE_STEPS=12;
const edgeMap=new Map();
function edgeKey(a,b){const pa=`${a.x.toFixed(3)},${a.z.toFixed(3)}`,pb=`${b.x.toFixed(3)},${b.z.toFixed(3)}`;return pa<pb?`${pa}|${pb}`:`${pb}|${pa}`;}
let builtTiles=0;
for(const tile of tiles){
 if(builtTiles++%64===0){
  $('#loading-text').textContent=`正在连接山脊与溪谷 · ${Math.round(builtTiles/tiles.length*100)}%`;
  await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 const ring=corners(tile.x,tile.z);
 const H=(x,z)=>tile.type==='water'?.13:relief(x,z);
 tile.height=H(tile.x,tile.z);
 const distance=Math.hypot(tile.x-xuantianPlace.x,tile.z-xuantianPlace.z);
 const radialSteps=distance<9?20:distance<27?8:2;
 // Identical outer-edge samples for every neighbor; only the interior rings
 // change density. There are no terrain cracks at the high-detail LOD boundary.
 for(let e=0;e<6;e++){
  const a=ring[e],b=ring[(e+1)%6];
  const sample=(r,i)=>{const t=i/EDGE_STEPS,f=r/radialSteps,x=tile.x+(a.x+(b.x-a.x)*t-tile.x)*f,z=tile.z+(a.z+(b.z-a.z)*t-tile.z)*f;return {x,y:H(x,z),z};};
  for(let i=0;i<EDGE_STEPS;i++){
   triangle(tile,{x:tile.x,y:tile.height,z:tile.z},sample(1,i),sample(1,i+1));
   for(let r=1;r<radialSteps;r++){
    triangle(tile,sample(r,i),sample(r+1,i),sample(r+1,i+1));
    triangle(tile,sample(r,i),sample(r+1,i+1),sample(r,i+1));
   }
  }
  const key=edgeKey(a,b);const prior=edgeMap.get(key);
  if(prior){
   if(prior.tile.region!==tile.region&&tile.type!=='water'&&prior.tile.type!=='water'){
    for(let k=0;k<EDGE_STEPS;k++){const p=new THREE.Vector3(a.x,0,a.z).lerp(new THREE.Vector3(b.x,0,b.z),k/EDGE_STEPS),q=new THREE.Vector3(a.x,0,a.z).lerp(new THREE.Vector3(b.x,0,b.z),(k+1)/EDGE_STEPS);borderPoints.push(p.x,relief(p.x,p.z)+.055,p.z,q.x,relief(q.x,q.z)+.055,q.z);}
   }
  }else{
   edgeMap.set(key,{tile,a,b});
   for(let k=0;k<EDGE_STEPS;k++){
    const x1=a.x+(b.x-a.x)*k/EDGE_STEPS,z1=a.z+(b.z-a.z)*k/EDGE_STEPS,x2=a.x+(b.x-a.x)*(k+1)/EDGE_STEPS,z2=a.z+(b.z-a.z)*(k+1)/EDGE_STEPS;
    gridPoints.push(x1,H(x1,z1)+.024,z1,x2,H(x2,z2)+.024,z2);
   }
  }
  // Coast and exposed map edges have real depth, never disconnected floating tiles.
  const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,neighbor=tileAt(mx+(mx-tile.x)*.08,mz+(mz-tile.z)*.08);
  if(tile.type!=='water'&&(neighbor===tile||neighbor.type==='water')){
   for(let k=0;k<EDGE_STEPS;k++){
    const p=sample(radialSteps,k),q=sample(radialSteps,k+1);
    triangle(tile,p,q,{x:q.x,y:-.35,z:q.z},true);
    triangle(tile,p,{x:q.x,y:-.35,z:q.z},{x:p.x,y:-.35,z:p.z},true);
   }
  }
 }
}
const terrainGeometry=new THREE.BufferGeometry();
terrainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
terrainGeometry.setAttribute('aVolcano',new THREE.Float32BufferAttribute(lavaMask,1));
terrainGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrainGeometry.computeVertexNormals();
// Shared gradient normals keep the continuous sculpt from showing per-cell seams.
const terrainNormals=terrainGeometry.attributes.normal;
for(let i=0;i<positions.length;i+=3){
 const x=positions[i],y=positions[i+1],z=positions[i+2];if(y<.2||sectInfluence(x-xuantianPlace.x,z-xuantianPlace.z)<.01)continue;
 const normal=new THREE.Vector3(relief(x-.035,z)-relief(x+.035,z),.07,relief(x,z-.035)-relief(x,z+.035)).normalize();terrainNormals.setXYZ(i/3,normal.x,normal.y,normal.z);
}
const terrainMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,flatShading:false});
// Geological grain is shaded in world space, so zooming never reveals a bitmap plate.
terrainMaterial.onBeforeCompile=shader=>{
 shader.vertexShader='attribute float aVolcano; varying float vVolcano; varying vec3 vAtlasPosition;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAtlasPosition = position; vVolcano = aVolcano;');
 shader.fragmentShader=`varying float vVolcano; varying vec3 vAtlasPosition;
 float atlasHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 float atlasNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(atlasHash(i),atlasHash(i+vec3(1,0,0)),f.x),mix(atlasHash(i+vec3(0,1,0)),atlasHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(atlasHash(i+vec3(0,0,1)),atlasHash(i+vec3(1,0,1)),f.x),mix(atlasHash(i+vec3(0,1,1)),atlasHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
 `+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
 float grain=atlasNoise(vAtlasPosition*15.)*.45+atlasNoise(vAtlasPosition*45.)*.25+atlasNoise(vAtlasPosition*4.)*.3;
 float strata=sin(vAtlasPosition.y*25.+atlasNoise(vAtlasPosition*2.)*9.)*.055;
 diffuseColor.rgb*=.76+grain*.40+strata*smoothstep(.8,2.,vAtlasPosition.y);
 `);
 shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
 float vein=abs(sin(vAtlasPosition.x*.84+sin(vAtlasPosition.z*.33)*1.7+atlasNoise(vAtlasPosition*1.2)*.38));
 float molten=(1.-smoothstep(.055,.15,vein))*vVolcano*(1.-smoothstep(.9,2.2,vAtlasPosition.y));
 totalEmissiveRadiance+=vec3(1.6,.24,.018)*molten;
 `);
};
const terrain=new THREE.Mesh(terrainGeometry,terrainMaterial);
terrain.castShadow=true;terrain.receiveShadow=true;world.add(terrain);
// Typed GPU buffers own these values now; don't retain duplicate JS arrays and
// hundreds of thousands of temporary height samples for the whole session.
positions.length=0;colors.length=0;lavaMask.length=0;heightCache.clear();
function lines(points,color,opacity){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));return new THREE.LineSegments(g,new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));}
const grid=lines(gridPoints,'#d3d3b7',.19);world.add(grid);
const borders=lines(borderPoints,'#f1e4b4',.85);world.add(borders);
const sea=new THREE.Mesh(new THREE.PlaneGeometry(300,250),new THREE.MeshStandardMaterial({color:'#467987',roughness:.42,metalness:.2}));sea.rotation.x=-Math.PI/2;sea.position.y=-.39;sea.receiveShadow=true;scene.add(sea);

// Efficient repeated set dressing: one instanced draw per geometry/material.
const batches=new Map();
const geos={
 trunk:new THREE.CylinderGeometry(.035,.055,1,5),pine:new THREE.ConeGeometry(.38,1.15,7),
 leaf:new THREE.IcosahedronGeometry(.4,1),rock:new THREE.IcosahedronGeometry(1,0),
 block:new THREE.BoxGeometry(1,1,1),gold:new THREE.SphereGeometry(.08,6,4),
 palm:new THREE.ConeGeometry(.55,.12,5),spire:new THREE.ConeGeometry(.13,.7,6)
};
const matCache=new Map();
function material(color){if(!matCache.has(color))matCache.set(color,new THREE.MeshStandardMaterial({color,roughness:.83}));return matCache.get(color);}
const dummy=new THREE.Object3D();
function instance(kind,color,x,y,z,sx=1,sy=sx,sz=sx,rotation=0){
 const key=kind+color;if(!batches.has(key))batches.set(key,{geo:geos[kind],color,matrices:[]});
 dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,rotation,0);dummy.updateMatrix();batches.get(key).matrices.push(dummy.matrix.clone());
}
function closeToLandmark(x,z){return landmarkPoints.some(p=>Math.hypot(x-p.x,z-p.z)<(p.id==='academy'?5:p.id==='xuantian'?8:3.3));}
const grassPalette=['#3b654e','#47745a','#567951','#638355','#749363'];
function tree(x,z,s,seed,palm=false){
 const y=elevation(x,z);
 instance('trunk',palm?'#827355':'#655a41',x,y+s*.42,z,s,s*.9,s);
 if(palm){for(let a=0;a<5;a++){const t=a*Math.PI*2/5;instance('palm','#4b8062',x+Math.cos(t)*s*.25,y+s*.96,z+Math.sin(t)*s*.25,s,s,s,a);}return;}
 const c=grassPalette[Math.floor(random(seed)*grassPalette.length)];
 if(random(seed,2)>.3){instance('pine',c,x,y+s*.78,z,s,s,s);instance('pine',c,x,y+s*1.1,z,s*.7,s*.75,s*.7);}
 else{instance('leaf',c,x,y+s*.92,z,s,s*1.2,s);instance('leaf',c,x+s*.2,y+s*.67,z,s*.8,s,s*.8);}
}
for(const tile of tiles){
 const seed=tile.col*1000+tile.row*37;
 const forest=tile.type==='forest',oasis=tile.type==='oasis';
 const count=forest?15:oasis?8:tile.type==='meadow'?3:tile.type==='mountain'?2:0;
 for(let j=0;j<count;j++){
  const a=random(seed+j,2)*Math.PI*2,d=Math.sqrt(random(seed+j,4))*RADIUS*.79;
  const x=tile.x+Math.cos(a)*d,z=tile.z+Math.sin(a)*d;
  if(closeToLandmark(x,z))continue;
  const influence=sectInfluence(x-xuantianPlace.x,z-xuantianPlace.z);
  const slope=Math.hypot(relief(x+.1,z)-relief(x-.1,z),relief(x,z+.1)-relief(x,z-.1))/.2;
  if(relief(x,z)>1.7&&(influence<.05||slope>1.7))continue;
  const stream=streamSample((x-xuantianPlace.x)/SECT_SCALE,(z-xuantianPlace.z)/SECT_SCALE);
  if(influence>.1&&stream.distance<.8)continue;
  tree(x,z,(.7+random(seed+j,5)*.65)*(1-influence*.47),seed+j,oasis);
 }
 if(tile.type==='mesa'||tile.type==='ash'||tile.type==='mountain')for(let j=0;j<2;j++){
  const x=tile.x+(random(seed+j,7)-.5)*1.8,z=tile.z+(random(seed+j,8)-.5)*1.8;
  if(relief(x,z)<1.1)instance('rock',tile.type==='mesa'?'#b7a17b':'#828478',x,relief(x,z)+.12,z,.12+random(seed+j)*.23,.17,.23,seed);
 }
}

// Curved, hipped roofs and stacked pagodas; original geometry, no game assets.
function roofGeometry(){
 const p=[];const ring=[];for(let i=0;i<4;i++){
  const a=[[-1,-.7],[1,-.7],[1,.7],[-1,.7]][i];ring.push(new THREE.Vector3(a[0],.04,a[1]));
 }
 const top=[new THREE.Vector3(-.57,.52,0),new THREE.Vector3(.57,.52,0)];
 const faces=[[ring[0],ring[1],top[1]],[ring[0],top[1],top[0]],[ring[1],ring[2],top[1]],[ring[2],ring[3],top[0]],[ring[2],top[0],top[1]],[ring[3],ring[0],top[0]]];
 for(const f of faces)for(const v of [f[0],f[2],f[1]])p.push(v.x,v.y,v.z);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;
}
geos.roof=roofGeometry();
function hall(x,z,y,s,roof='#466d68',walls='#dfd9bb',levels=1){
 instance('block','#b7b9a5',x,y+.1*s,z,2.08*s,.2*s,1.64*s);
 for(let l=0;l<levels;l++){
  const k=s*Math.pow(.78,l),yy=y+.22*s+l*.95*s;
  instance('block',walls,x,yy+.37*k,z,1.48*k,.74*k,1.02*k);
  instance('block','#364942',x,yy+.35*k,z+.517*k,.25*k,.62*k,.018*k);
  for(const dx of [-.67,.67])for(const dz of [-.48,.48])instance('block','#8c6547',x+dx*k,yy+.39*k,z+dz*k,.065*k,.79*k,.065*k);
  instance('roof',roof,x,yy+.8*k,z,k,k,k);
  instance('block','#d3b46c',x,yy+1.32*k,z,1.18*k,.045*k,.05*k);
  for(const dx of [-.95,.95])for(const dz of [-.65,.65])instance('gold','#d3b46c',x+dx*k,yy+.87*k,z+dz*k,.8*k,.8*k,.8*k);
 }
}
function walkway(a,b,width=.28,color='#c8c5a7'){
 const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz);const steps=Math.ceil(dist/.8);
 for(let i=0;i<steps;i++){
  const f=(i+.5)/steps,x=a.x+dx*f,z=a.z+dz*f;const h=baseHeight(x,z)+.08;
  instance('block',color,x,h,z,width,.055,dist/steps+.03,Math.atan2(dx,dz));
 }
}
for(const place of landmarkPoints){
 if(place.id==='xuantian')continue;
 let {x,z,id}=place;let y=baseHeight(x,z)+.2;
 const roof=id==='diyuan'?'#574441':id==='huangting'?'#ad985d':id==='tianyan'?'#8ca3a0':'#3f6b66';
 const walls=id==='diyuan'?'#777566':id==='huangting'?'#e0c695':'#e5e1c7';
 if(id==='tianyan')y=7.1;
 if(id==='academy')y=2.6;
 // Broad terraces visually tie architecture to the mountain instead of floating boxes.
 for(let i=0;i<4;i++){
  const r=(id==='academy'?4.2:2.8)-i*.36;
  const g=new THREE.CylinderGeometry(r,r+.2,.42,12);
  const m=new THREE.Mesh(g,material(id==='diyuan'?'#6c6d5f':'#c7c9b1'));
  m.position.set(x,y-.55+i*.34,z);m.castShadow=m.receiveShadow=true;world.add(m);
 }
 y+=.8;place.y=y;
 if(id==='tianyan'){
  const island=new THREE.Mesh(new THREE.ConeGeometry(3.3,6.9,7),material('#8b9783'));island.rotation.z=Math.PI;island.position.set(x,y-4.0,z);island.castShadow=true;world.add(island);
 }
 if(id==='academy'){
  const rock=new THREE.Mesh(new THREE.CylinderGeometry(3.5,5.2,3,11),material('#929f8d'));rock.position.set(x,.8,z);rock.castShadow=true;rock.receiveShadow=true;world.add(rock);
 }
 hall(x,z-.6,y,id==='academy'?1.55:1.25,roof,walls,id==='academy'?3:2);
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3,d=id==='academy'?3.1:2.3;
  hall(x+Math.cos(a)*d,z+Math.sin(a)*d,y,.42+(i%2)*.13,roof,walls,2);
 }
 // Main avenue, ceremonial gate, and stairs.
 hall(x,z+2.1,y,.7,roof,walls,1);
 for(let i=0;i<13;i++)instance('block',walls,x,y-.07-i*.095,z+2.3+i*.16,1.15,.12,.22);
 for(let i=0;i<6;i++){
  const a=i*Math.PI/3;
  instance('spire','#c7ac63',x+Math.cos(a)*2.55,y+1.1,z+Math.sin(a)*2.55,.7,1.5,.7);
 }
 if(id!=='tianyan')for(let i=0;i<10;i++){
  const a=random(i,id.length)*Math.PI*2,d=3.6+random(i+89)*1.5;
  const xx=x+Math.cos(a)*d,zz=z+Math.sin(a)*d;
  if(tileAt(xx,zz)?.type==='water'||relief(xx,zz)>1.4)continue;
  hall(xx,zz,baseHeight(xx,zz),.28+random(i)*.27,roof,walls);walkway({x,z},{x:xx,z:zz},.18);
 }
}
// Additional northeast floating islands and bridges.
const sky=landmarkPoints.find(p=>p.id==='tianyan');
const mistCanvas=document.createElement('canvas');mistCanvas.width=256;mistCanvas.height=128;
const mistContext=mistCanvas.getContext('2d');
for(let i=0;i<13;i++){
 const x=35+random(i,21)*186,y=45+random(i,43)*35,r=24+random(i,17)*26;
 const gradient=mistContext.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'rgba(237,243,224,.2)');gradient.addColorStop(.45,'rgba(214,231,219,.13)');gradient.addColorStop(1,'rgba(214,231,219,0)');
 mistContext.fillStyle=gradient;mistContext.fillRect(x-r,y-r,r*2,r*2);
}
const mistTexture=new THREE.CanvasTexture(mistCanvas);mistTexture.colorSpace=THREE.SRGBColorSpace;
const mistMaterial=new THREE.SpriteMaterial({map:mistTexture,transparent:true,depthWrite:false,opacity:.65});
for(let i=0;i<18;i++){
 const mist=new THREE.Sprite(mistMaterial);const a=i*2.4,d=3+random(i,44)*14;
 mist.position.set(sky.x+Math.cos(a)*d,3.9+random(i,34)*3,sky.z+Math.sin(a)*d);mist.scale.set(9+random(i,5)*9,4.2,1);world.add(mist);
}
for(let i=0;i<10;i++){
 const a=i*2.4,d=5+(i%3)*2.8,x=sky.x+Math.cos(a)*d,z=sky.z+Math.sin(a)*d,y=5.4+random(i,7)*4;
 const island=new THREE.Mesh(new THREE.ConeGeometry(.8+random(i),3+random(i,8)*2,7),material('#8b9988'));island.rotation.z=Math.PI;island.position.set(x,y-1.5,z);island.castShadow=true;world.add(island);
 const cap=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.15,.3,7),material('#8b9a69'));cap.position.set(x,y,z);cap.receiveShadow=true;world.add(cap);
 hall(x,z,y+.2,.55,'#8c9b86','#e4debd',2);
 const mid=new THREE.Vector3((x+sky.x)/2,Math.min(y,sky.y)+.2,(z+sky.z)/2);
 const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(x,y+.2,z),mid,new THREE.Vector3(sky.x,sky.y+.25,sky.z));
 const bridge=new THREE.Mesh(new THREE.TubeGeometry(curve,20,.065,4,false),material('#d1c08e'));world.add(bridge);
}
// Watch towers and quiet settlements across the open hexes.
for(const tile of tiles){
 if(closeToLandmark(tile.x,tile.z)||tile.height>1.2)continue;
 const n=random(tile.col+181,tile.row+63);
 if(['meadow','desert','ash'].includes(tile.type)&&n>.91){
  hall(tile.x,tile.z,tile.height,.26,tile.type==='desert'?'#998160':'#586f62','#c4bc97',n>.97?3:1);
 }
}
// Sea islets, sails, and waterfalls give each region a distinct scale.
for(const tile of tiles.filter(t=>t.type==='water')){
 const n=random(tile.col+67,tile.row+123);
 if(tile.v>.66&&n>.83){
  instance('rock','#829b85',tile.x,.35,tile.z,.5,.9+random(tile.row)*1.2,.6,tile.row);
  if(n>.94)hall(tile.x,tile.z,1,.23,'#52827b','#d8d7b9',2);
 }
}
const waterLines=[],lavaLines=[];
for(const tile of tiles){
 const seed=tile.col*41+tile.row*43;
 if(tile.type==='water'&&random(seed)>.35){
  const x=tile.x-.4,z=tile.z+.3;waterLines.push(x,.16,z,x+.65,.16,z-.06);
 }
 if(tile.type==='volcanic'&&random(seed)>.4){
  for(let i=0;i<4;i++){
   const a=i*1.2,x=tile.x+Math.sin(a)*.6,z=tile.z-.8+i*.4,x2=tile.x+Math.sin(a+1.2)*.6,z2=z+.4;
   lavaLines.push(x,relief(x,z)+.08,z,x2,relief(x2,z2)+.08,z2);
  }
 }
}
const waterStreaks=lines(waterLines,'#9ac4c6',.33);world.add(waterStreaks);
const lava=lines(lavaLines,'#ff9451',.92);world.add(lava);
const waterfallMaterial=new THREE.MeshBasicMaterial({color:'#b2e8de',transparent:true,opacity:.62,side:THREE.DoubleSide,depthWrite:false});
for(let i=0;i<13;i++){
 const x=-33+random(i,61)*28,z=-20+random(i,47)*15;
 if(Math.hypot(x-xuantianPlace.x,z-xuantianPlace.z)<12)continue;
 const h=relief(x,z);if(h<1.2)continue;
 const fall=new THREE.Mesh(new THREE.PlaneGeometry(.18+random(i)*.22,h),waterfallMaterial);fall.position.set(x,h/2,z+.17);world.add(fall);
}
for(const batch of batches.values()){
 const mesh=new THREE.InstancedMesh(batch.geo,material(batch.color),batch.matrices.length);
 batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();world.add(mesh);
}

const xuantianModel=createXuantianSect({scale:SECT_SCALE,heightAt:(x,z)=>(relief(xuantianPlace.x+x*SECT_SCALE,xuantianPlace.z+z*SECT_SCALE)-miniatureBase)/SECT_SCALE});
xuantianModel.group.position.set(xuantianPlace.x,miniatureBase,xuantianPlace.z);
xuantianModel.group.userData.tileIds=xuantianCoreTiles.map(t=>t.id);
world.add(xuantianModel.group);
xuantianPlace.y=miniatureBase+11.3*SECT_SCALE;
// Rivers follow a continuous descending channel across cells into the lake.
const streamModel=createSectStream({base:sectBase,groundAt:(x,z)=>relief(x+xuantianPlace.x,z+xuantianPlace.z)});
const sectStream=streamModel.group;sectStream.position.set(xuantianPlace.x,0,xuantianPlace.z);world.add(sectStream);
heightCache.clear();

// Region and terrain labels remain crisp DOM text; they track real 3D coordinates.
const annotations=[];
const labelHost=$('#map-labels');
for(const place of landmarkPoints){
 const el=document.createElement('button');el.className='map-label landmark-label';el.textContent=place.name;el.style.setProperty('--region-color',place.color);el.setAttribute('aria-label',`定位${place.name}`);
 el.addEventListener('click',()=>focusRegion(place.id));labelHost.append(el);annotations.push({el,pos:new THREE.Vector3(place.x,place.y+(place.id==='xuantian'?.16:3),place.z),landmark:true,id:place.id});
}
for(const [text,u,v]of labels){
 const p=worldPoint(u,v),el=document.createElement('span');el.className=`map-label terrain-label ${text.includes('海')||text.includes('湖')?'water':''}`;el.textContent=text;labelHost.append(el);
 annotations.push({el,pos:new THREE.Vector3(p.x,1.3,p.z),landmark:false});
}
let selected=null,selectedId=null;
const selection=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#ffedaf',transparent:true,opacity:1,depthTest:false}));selection.renderOrder=20;selection.visible=false;world.add(selection);
const hover=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#f5f1c8',transparent:true,opacity:.6,depthTest:false}));hover.renderOrder=19;hover.visible=false;world.add(hover);
function outline(line,tile){
 const points=[];const cs=corners(tile.x,tile.z);
 for(let e=0;e<6;e++)for(let i=0;i<EDGE_STEPS;i++){const a=cs[e],b=cs[(e+1)%6],x=a.x+(b.x-a.x)*i/EDGE_STEPS,z=a.z+(b.z-a.z)*i/EDGE_STEPS;points.push(new THREE.Vector3(x,tile.type==='water'?.2:relief(x,z)+.12,z));}
 line.geometry.dispose();line.geometry=new THREE.BufferGeometry().setFromPoints(points);line.visible=true;
}
function showDetails(tile,regionId=null){
 const regionFocus=Boolean(regionId);
 if(sectCore(tile.x-xuantianPlace.x,tile.z-xuantianPlace.z))regionId='xuantian';
 if(regionId!=='xuantian')document.body.classList.remove('miniature-inspection');
 selected=tile;selectedId=regionId;
 const region=regions[regionId||tile.region];
 $('#selection-title').textContent=regionId?region.name:types[tile.type].name;
 $('#selection-eyebrow').textContent=regionId?`${region.en} / 宗门志`:`HEX ${String(tile.col+1).padStart(2,'0')} · ${String(tile.row+1).padStart(2,'0')} / 地块`;
 $('#selection-description').textContent=region.description;
 $('#selection-type').textContent=regionId?region.terrain:types[tile.type].name;
 $('#selection-region').textContent=region.name;
 $('#selection-coordinates').textContent=`${String(tile.col+1).padStart(2,'0')} / ${String(tile.row+1).padStart(2,'0')}`;
 $('#selection-places').textContent=region.places;
 $('#inspect-xuantian').hidden=regionId!=='xuantian';
 $('#miniature-notes').hidden=regionId!=='xuantian';
 if(regionId==='xuantian'){
  $('#selection-eyebrow').textContent='XUANTIAN / 连续山岳宗门';
  $('#selection-description').textContent='山门起于溪谷，天阶沿群峰登临玄天殿。后山接入青岚山脉，松林随山麓铺展，飞瀑汇成溪流向碧落湖延伸。';
  $('#selection-type').textContent=`跨 ${xuantianCoreTiles.length} 格 · 山岳宗门`;
  $('#selection-places').textContent='玄天殿 / 天衡台 / 祖师殿 / 藏经阁 / 剑院 / 丹院';
 }
 $('.selection').hidden=false;outline(selection,tile);
 if(regionFocus&&regionId==='xuantian')selection.visible=false;
 document.querySelectorAll('[data-region]').forEach(b=>b.classList.toggle('active',b.dataset.region===(regionId||tile.region)));
 annotations.filter(a=>a.landmark).forEach(a=>a.el.classList.toggle('is-selected',a.id===(regionId||tile.region)));
}
let flight=null;
function fly(target,distance,top=false,miniature=false){
 const from=camera.position.clone(),fromTarget=controls.target.clone();
 const offset=top?new THREE.Vector3(0,distance*.98,distance*.13):miniature?new THREE.Vector3(distance*.25,distance*.64,distance*.72):new THREE.Vector3(distance*.04,distance*.71,distance*.70);
 const to=target.clone().add(offset);
 if(reduced.matches){controls.target.copy(target);camera.position.copy(to);controls.update();return;}
 flight={from,fromTarget,to,target,start:performance.now(),duration:1250};
}
function overview(){
 document.body.classList.remove('miniature-inspection');
 selected=null;selectedId=null;selection.visible=false;$('.selection').hidden=true;
 document.querySelectorAll('[data-region]').forEach(b=>b.classList.remove('active'));
 annotations.forEach(a=>a.el.classList.remove('is-selected'));
 fly(new THREE.Vector3(mobile()?0:-1,0,0),mobile()?132:106);
 $('#tilt').setAttribute('aria-pressed','false');$('#tilt').setAttribute('aria-label','切换俯视地图');
}
function inspectXuantian(){
 document.body.classList.add('miniature-inspection');showDetails(xuantianTile,'xuantian');
 $('#tilt').setAttribute('aria-pressed','false');$('#tilt').setAttribute('aria-label','切换俯视地图');
 fly(new THREE.Vector3(xuantianPlace.x,miniatureBase+(mobile()?1.1:2.4),xuantianPlace.z-.6),mobile()?33:25.5,false,true);
}
function focusRegion(id){const p=landmarkPoints.find(p=>p.id===id);if(!p)return;if(id==='xuantian'){inspectXuantian();return;}document.body.classList.remove('miniature-inspection');showDetails(tileAt(p.x,p.z),id);fly(new THREE.Vector3(p.x,p.y*.25,p.z),mobile()?48:45);}
$('#inspect-xuantian').addEventListener('click',inspectXuantian);
document.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click',()=>focusRegion(b.dataset.region)));
$('#close-selection').addEventListener('click',()=>{$('.selection').hidden=true;selection.visible=false;selected=null;selectedId=null;document.body.classList.remove('miniature-inspection');annotations.forEach(a=>a.el.classList.remove('is-selected'));document.querySelectorAll('[data-region]').forEach(b=>b.classList.remove('active'));});
$('#home').addEventListener('click',overview);$('#reset-mini').addEventListener('click',overview);
function zoom(factor){flight=null;const o=camera.position.clone().sub(controls.target),length=THREE.MathUtils.clamp(o.length()*factor,controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(o.setLength(length));controls.update();}
$('#zoom-in').addEventListener('click',()=>zoom(.8));$('#zoom-out').addEventListener('click',()=>zoom(1.25));
$('#tilt').addEventListener('click',()=>{const top=$('#tilt').getAttribute('aria-pressed')!=='true';$('#tilt').setAttribute('aria-pressed',String(top));$('#tilt').setAttribute('aria-label',top?'切换立体地图':'切换俯视地图');fly(controls.target.clone(),camera.position.distanceTo(controls.target),top);});
for(const [id,object]of [['grid',grid],['borders',borders]])$('#'+id).addEventListener('click',()=>{object.visible=!object.visible;$('#'+id).setAttribute('aria-pressed',String(object.visible));});
$('#labels').addEventListener('click',()=>{const off=document.body.classList.toggle('map-labels-off');$('#labels').setAttribute('aria-pressed',String(!off));});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('[data-view]').forEach(v=>{v.classList.toggle('active',v===b);v.setAttribute('aria-pressed',String(v===b));});
 const mode=b.dataset.view;grid.material.opacity=mode==='terrain'?.30:.19;borders.visible=mode!=='terrain';$('#borders').setAttribute('aria-pressed',String(borders.visible));
 terrain.material.vertexColors=true;
 grid.visible=true;$('#grid').setAttribute('aria-pressed','true');
 if(mode==='territory'){borders.material.color.set('#fff1ba');borders.material.opacity=1;}
 else {borders.material.color.set('#f1e4b4');borders.material.opacity=.85;}
 if(mode==='overview')overview();
}));
$('#help').addEventListener('click',()=>$('#help-dialog').showModal());$('#close-help').addEventListener('click',()=>$('#help-dialog').close());

const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart=null,moved=false,lastHoverHit=0;
function hit(event){const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);const intersection=raycaster.intersectObjects([terrain,xuantianModel.group,sectStream],true)[0];return intersection?(intersection.object===terrain?terrainTriangles[intersection.faceIndex]:tileAt(intersection.point.x,intersection.point.z)):null;}
renderer.domElement.addEventListener('pointerdown',event=>{flight=null;pointerStart={x:event.clientX,y:event.clientY};moved=false;});
renderer.domElement.addEventListener('pointermove',event=>{
 if(pointerStart&&Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>6)moved=true;
 if(event.buttons||event.pointerType==='touch'){hover.visible=false;return;}
 const now=performance.now();if(now-lastHoverHit<75)return;lastHoverHit=now;
 const tile=hit(event);if(tile)outline(hover,tile);else hover.visible=false;
});
renderer.domElement.addEventListener('pointerup',event=>{if(!moved&&event.button===0){const tile=hit(event);if(tile)showDetails(tile);}pointerStart=null;});
renderer.domElement.addEventListener('pointerleave',()=>{hover.visible=false;pointerStart=null;});
renderer.domElement.addEventListener('wheel',()=>{flight=null;},{passive:true});
stage.addEventListener('keydown',event=>{
 if(event.target!==stage&&event.target!==renderer.domElement)return;
 const step=camera.position.distanceTo(controls.target)*.045;
 const movements={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
 if(movements[event.key]){event.preventDefault();flight=null;const [x,z]=movements[event.key];controls.target.x+=x;controls.target.z+=z;camera.position.x+=x;camera.position.z+=z;}
 if(event.key==='Home'){event.preventDefault();overview();}if(['+','=','-'].includes(event.key)){event.preventDefault();zoom(event.key==='-'?1.2:.83);}
});
// Mini-map is derived from the same tile data and supports click-to-fly.
const mini=$('#minimap'),ctx=mini.getContext('2d');
function drawMini(){
 ctx.clearRect(0,0,400,240);ctx.fillStyle='#244750';ctx.fillRect(0,0,400,240);
 for(const t of tiles){ctx.fillStyle=types[t.type].color;ctx.beginPath();for(const [i,p]of corners(t.x,t.z).entries()){const x=(p.x/WIDTH+.5)*376+12,y=(p.z/DEPTH+.5)*220+10;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();}
 for(const p of landmarkPoints){ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.u*376+12,p.v*220+10,3.3,0,Math.PI*2);ctx.fill();}
 const x=(controls.target.x/WIDTH+.5)*376+12,y=(controls.target.z/DEPTH+.5)*220+10;
 const range=camera.position.distanceTo(controls.target)*.30;ctx.strokeStyle='#f8ebbd';ctx.lineWidth=1.5;ctx.strokeRect(x-range/2,y-range/3,range,range*.666);
}
mini.addEventListener('click',e=>{const rect=mini.getBoundingClientRect();const u=THREE.MathUtils.clamp(((e.clientX-rect.left)/rect.width*400-12)/376,0,1),v=THREE.MathUtils.clamp(((e.clientY-rect.top)/rect.height*240-10)/220,0,1);const p=worldPoint(u,v);fly(new THREE.Vector3(p.x,0,p.z),50);});
mini.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();overview();}});

let last=0,lastUI=0,raf=0,hidden=document.hidden;
const projected=new THREE.Vector3();
function updateLabels(){
 const dist=camera.position.distanceTo(controls.target),placed=[];
 for(const a of annotations){
  projected.copy(a.pos).project(camera);const x=(projected.x*.5+.5)*innerWidth,y=(-projected.y*.5+.5)*innerHeight;
  let visible=projected.z<1&&projected.z>-1&&x>10&&x<innerWidth-10&&y>86&&y<innerHeight-85;
  if(dist<32&&a.id==='xuantian')visible=false;
  if(!a.landmark&&mobile()&&dist>90)visible=false;
  if(!a.landmark&&placed.some(p=>Math.abs(p.x-x)<95&&Math.abs(p.y-y)<34))visible=false;
  if(visible){placed.push({x,y});a.el.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;}
  a.el.hidden=!visible;
 }
 $('#zoom-value').textContent=`${Math.round(106/dist*100)}%`;
 $('#compass-rose').style.transform=`rotate(${-controls.getAzimuthalAngle()*180/Math.PI}deg)`;
 drawMini();
}
function render(time=0){
 if(hidden)return;raf=requestAnimationFrame(render);
 if(time-last<30)return;last=time;
 if(flight){
  const t=Math.min(1,(time-flight.start)/flight.duration),ease=t*t*t*(t*(t*6-15)+10);
  camera.position.lerpVectors(flight.from,flight.to,ease);controls.target.lerpVectors(flight.fromTarget,flight.target,ease);if(t===1)flight=null;
 }
 controls.update();
 // Tighten the sun's shadow frustum while inspecting tiny architecture. This
 // preserves roof/column contact shadows without increasing the global GPU cost.
 const distance=camera.position.distanceTo(controls.target),shadowRange=distance<50?Math.max(3,distance*.60):70;
 sunlight.target.position.copy(controls.target);sunlight.target.updateMatrixWorld();sunlight.position.copy(controls.target).add(new THREE.Vector3(-45,75,30));
 const shadowCamera=sunlight.shadow.camera;
 if(Math.abs(shadowCamera.right-shadowRange)>.025){Object.assign(shadowCamera,{left:-shadowRange,right:shadowRange,top:shadowRange,bottom:-shadowRange});shadowCamera.updateProjectionMatrix();}
 sunlight.shadow.normalBias=distance<50?.006:.09;
 sunlight.shadow.bias=distance<50?-.00008:-.0006;
 // Bound panning while preserving camera offset.
 const x=THREE.MathUtils.clamp(controls.target.x,-WIDTH*.6,WIDTH*.6),z=THREE.MathUtils.clamp(controls.target.z,-DEPTH*.6,DEPTH*.6);
 camera.position.x+=x-controls.target.x;camera.position.z+=z-controls.target.z;controls.target.x=x;controls.target.z=z;
 if(!reduced.matches){waterStreaks.material.opacity=.28+Math.sin(time*.00065)*.07;lava.material.opacity=.82+Math.sin(time*.0011)*.12;xuantianModel.update(time*.001);streamModel.update(time*.001);}
 renderer.render(scene,camera);
 if(time-lastUI>70){updateLabels();lastUI=time;}
}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);updateLabels();});
document.addEventListener('visibilitychange',()=>{hidden=document.hidden;if(hidden)cancelAnimationFrame(raf);else raf=requestAnimationFrame(render);});
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(raf);$('#loading').classList.remove('loaded');$('#loading h2').textContent='图形连接已暂停';$('#loading-text').textContent='刷新页面即可重新加载地图。';});
controls.target.set(-1,0,0);camera.position.set(3,mobile()?94:75,mobile()?93:74);controls.update();
renderer.render(scene,camera);updateLabels();
document.body.dataset.mapReady='true';document.body.dataset.tileCount=String(tiles.length);
document.body.dataset.xuantianModel='continuous-landscape-4';
document.body.dataset.xuantianCells=String(xuantianCoreTiles.length);
if(new URLSearchParams(location.search).get('focus')==='xuantian')inspectXuantian();
$('#loading').classList.add('loaded');setTimeout(()=>{$('#loading').hidden=true;},750);
raf=requestAnimationFrame(render);
