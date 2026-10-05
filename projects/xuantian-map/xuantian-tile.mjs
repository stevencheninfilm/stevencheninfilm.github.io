import * as THREE from '../../assets/vendor/three-0.160.0/three.module.js';
import {SECT_SCALE,sectLocalHeight,PEAKS,streamSample} from './xuantian-landscape.mjs';

// Architecture for a continuous, multi-cell landscape. The atlas owns the
// terrain surface; this module adds buildings and details without a base plate.
export const XUANTIAN_FEATURES = [
  {name:'山门',x:0,y:1.04,z:6.8},
  {name:'内门',x:0,y:1.75,z:3.6},
  {name:'通玄天阶',x:0,y:3.2,z:.4},
  {name:'天衡台',x:0,y:4.65,z:-1.65},
  {name:'玄天殿',x:0,y:6.65,z:-4.45},
  {name:'青冥峰',x:-5.35,y:6.6,z:-3.65},
  {name:'紫霄峰',x:5.15,y:7.4,z:-4},
  {name:'祖师殿',x:-3.2,y:4.05,z:-.25},
  {name:'藏经阁',x:3.25,y:4.05,z:-.3},
  {name:'剑院',x:-3.85,y:2.65,z:2.6},
  {name:'丹院',x:4.05,y:2.45,z:2.5},
  {name:'药园',x:4.7,y:.83,z:4.65},
];
const rand=(a,b=0)=>{const n=Math.sin(a*127.1+b*311.7)*43758.5453;return n-Math.floor(n);};
const tau=Math.PI*2;
export function createXuantianSect({scale=SECT_SCALE,heightAt=sectLocalHeight}={}) {
  const root=new THREE.Group();root.name='xuantian-continuous-sect';root.scale.setScalar(scale);
  root.userData={kind:'xuantian-landscape',scale,features:XUANTIAN_FEATURES,footprint:'multi-cell',terrain:'shared-heightfield',detailVersion:4};
  const materialCache=new Map(),batches=new Map(),animatedWater=[];
  const palette={stone:'#b7b4a0',light:'#e2d7b4',rock:'#7b8171',darkRock:'#566553',grass:'#6e8550',roof:'#284e63',gold:'#bb9351',wood:'#794b31',door:'#283c38',water:'#409fac'};
  function mat(color,kind='matte') {
    const key=color+kind;if(materialCache.has(key))return materialCache.get(key);
    const m=new THREE.MeshStandardMaterial({color,roughness:kind==='water'?.28:kind==='metal'?.45:.86,metalness:kind==='metal'?.42:kind==='water'?.2:0});
    if(kind==='glow'){m.emissive=new THREE.Color(color);m.emissiveIntensity=.7;}
    if(kind==='stone'||kind==='ground'){
      m.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 vDiorama;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDiorama=position;');
        shader.fragmentShader=`varying vec3 vDiorama;
          float dioramaHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
          float dioramaNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(dioramaHash(i),dioramaHash(i+vec3(1,0,0)),f.x),mix(dioramaHash(i+vec3(0,1,0)),dioramaHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(dioramaHash(i+vec3(0,0,1)),dioramaHash(i+vec3(1,0,1)),f.x),mix(dioramaHash(i+vec3(0,1,1)),dioramaHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float grain=dioramaNoise(vDiorama*16.)*.55+dioramaNoise(vDiorama*43.)*.25+dioramaNoise(vDiorama*3.)*.2;
          diffuseColor.rgb*=.80+grain*.32;
        `);
      };
    }
    materialCache.set(key,m);return m;
  }
  const materials={stone:mat(palette.stone,'stone'),ivory:mat(palette.light,'stone'),rock:mat(palette.rock,'stone'),darkRock:mat(palette.darkRock,'stone'),grass:mat(palette.grass,'ground'),roof:mat(palette.roof),gold:mat(palette.gold,'metal'),wood:mat(palette.wood),door:mat(palette.door),water:mat(palette.water,'water'),foam:mat('#b9e4d6'),crystal:mat('#62c8dc','glow')};
  // Merge by material, including transformed normals. Architecture details cost
  // a handful of draw calls rather than one draw call per roof tile / stair.
  const transform=new THREE.Object3D(),normalMatrix=new THREE.Matrix3(),v=new THREE.Vector3(),n=new THREE.Vector3();
  function add(geometry,material,x=0,y=0,z=0,sx=1,sy=sx,sz=sx,ry=0,rx=0,rz=0){
    let batch=batches.get(material);if(!batch){batch={p:[],n:[]};batches.set(material,batch);}
    transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.set(rx,ry,rz);transform.updateMatrix();normalMatrix.getNormalMatrix(transform.matrix);
    const p=geometry.attributes.position,ns=geometry.attributes.normal,idx=geometry.index;
    for(let i=0;i<(idx?idx.count:p.count);i++){
      const j=idx?idx.getX(i):i;v.fromBufferAttribute(p,j).applyMatrix4(transform.matrix);n.fromBufferAttribute(ns,j).applyMatrix3(normalMatrix).normalize();
      batch.p.push(v.x,v.y,v.z);batch.n.push(n.x,n.y,n.z);
    }
  }
  const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,16),leaf=new THREE.IcosahedronGeometry(1,1),sphere=new THREE.SphereGeometry(1,10,6);
  function block(m,x,y,z,w,h,d,angle=0){add(box,m,x,y,z,w,h,d,angle);}
  function disk(m,x,y,z,r,h,segments=48){const g=new THREE.CylinderGeometry(r,r,h,segments);add(g,m,x,y,z);g.dispose();}
  function beam(a,b,r,m=materials.wood){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start),mid=start.clone().add(end).multiplyScalar(.5);
    const g=new THREE.CylinderGeometry(r,r,direction.length(),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));add(g,m,mid.x,mid.y,mid.z);g.dispose();
  }
  function tube(points,r,m,segments=32){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const g=new THREE.TubeGeometry(curve,segments,r,5,false);add(g,m);g.dispose();
  }
  function ring(x,y,z,r,m=materials.gold,thickness=.028){const g=new THREE.TorusGeometry(r,thickness,5,64);add(g,m,x,y,z,1,1,1,0,-Math.PI/2);g.dispose();}
  function meshData(points,indices){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return g;}

  // Peaks and pads are sampled by the world terrain, not separate cylinders.
  // Small ledges remain actual geometry and sit on that same shared surface.
  const mountainGardens=[];
  PEAKS.forEach(([x,z,rx,rz],seed)=>{
    for(let j=0;j<7;j++){
      const a=.30+j*1.17,d=.48+rand(seed,j)*.53,xx=x+Math.cos(a)*rx*d,zz=z+Math.sin(a)*rz*d,yy=heightAt(xx,zz);
      add(leaf,materials.rock,xx,yy-.07,zz,.34,.13,.30,seed+j);
      add(leaf,materials.grass,xx,yy+.03,zz,.31,.045,.27,seed+j);
      mountainGardens.push([xx,yy+.06,zz,.34+rand(seed,j)*.24,seed*19+j]);
    }
  });

  // Curved, genuinely thick tiled roofs. Eaves rise at all four corners;
  // laid ribs, gold ridges, brackets, columns and lattice doors remain geometry.
  const roofCache=new Map();
  function roof(w,d,h){
    const key=[w,d,h].join(':');if(roofCache.has(key))return roofCache.get(key);
    const p=[],idx=[],nx=32,nz=24;
    const height=(x,z)=>{const hip=Math.max(Math.abs(x)/w,Math.abs(z)/d);return h*(Math.pow(Math.max(0,1-hip),1.7)+.21*Math.pow(Math.abs(x)/w,8)+.175*Math.pow(Math.abs(z)/d,6));};
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=-w+2*w*i/nx,z=-d+2*d*j/nz;p.push(x,height(x,z),z);}
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;idx.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
    const g=meshData(p,idx);roofCache.set(key,{g,height});return {g,height};
  }
  function hall(x,y,z,s=1,levels=1){
    // Retaining piers descend into the sampled slope rather than leaving the
    // downhill corners of a mountain building hanging above its foundation.
    for(const side of [-1,1])for(const end of [-1,1]){
      const xx=x+side*.94*s,zz=z+end*.60*s,ground=Math.min(y,heightAt(xx,zz)),h=y-ground+.10;
      block(materials.stone,xx,ground+h/2,zz,.20*s,h,.24*s);
    }
    block(materials.stone,x,y+.09*s,z,2.25*s,.18*s,1.6*s);
    block(materials.ivory,x,y+.21*s,z,2.12*s,.10*s,1.50*s);
    for(let level=0;level<levels;level++){
      const k=s*Math.pow(.77,level),yy=y+.26*s+level*.88*s;
      block(materials.wood,x,yy+.31*k,z,1.58*k,.62*k,1.02*k);
      block(materials.door,x,yy+.31*k,z+.518*k,1.3*k,.53*k,.035*k);
      for(const side of [-1,1])for(let i=-2;i<=2;i++){
        add(cylinder,materials.wood,x+i*.37*k,yy+.36*k,z+side*.6*k,.043*k,.76*k,.043*k);
        block(materials.gold,x+i*.37*k,yy+.7*k,z+side*.6*k,.19*k,.11*k,.14*k);
        block(materials.ivory,x+i*.37*k,yy+.035*k,z+side*.6*k,.14*k,.10*k,.14*k);
      }
      for(let i=-6;i<=6;i++)block(materials.gold,x+i*.095*k,yy+.36*k,z+.54*k,.014*k,.39*k,.017*k);
      for(const dy of [.20,.37,.52])block(materials.gold,x,yy+dy*k,z+.55*k,1.35*k,.013*k,.015*k);
      block(materials.gold,x,yy+.63*k,z+.55*k,1.78*k,.06*k,.055*k);
      // Side-window lattice, beams and mortise brackets now read from orbit.
      for(const side of [-1,1]){
        block(materials.door,x+side*.795*k,yy+.35*k,z,.025*k,.42*k,.73*k);
        for(let j=-4;j<=4;j++)block(materials.gold,x+side*.816*k,yy+.36*k,z+j*.079*k,.016*k,.37*k,.015*k);
        for(const dy of [.24,.43])block(materials.gold,x+side*.823*k,yy+dy*k,z,.022*k,.016*k,.73*k);
        for(let j=-2;j<=2;j++){
          block(materials.wood,x+j*.37*k,yy+.72*k,z+side*.62*k,.25*k,.06*k,.13*k);
          block(materials.gold,x+j*.37*k,yy+.78*k,z+side*.63*k,.18*k,.055*k,.20*k);
          // Stepped dougong arms and bearing blocks project under the eave.
          for(let tier=0;tier<3;tier++){
            const bx=x+j*.37*k,by=yy+(.73+tier*.048)*k,bz=z+side*(.62+tier*.042)*k;
            block(materials.wood,bx,by,bz,(.18+tier*.065)*k,.034*k,.052*k);
            for(const arm of [-1,1])block(materials.gold,bx+arm*(.06+tier*.021)*k,by+.025*k,bz,.043*k,.045*k,.070*k);
          }
        }
      }
      const w=1.19*k,d=.86*k,h=.57*k,baseY=yy+.76*k,r=roof(w,d,h);add(r.g,materials.roof,x,baseY,z);
      // Tile courses follow roof curvature, not flat triangles.
      for(let i=-11;i<=11;i++){
        const xx=w*i/12;
        for(const side of [-1,1]){
          const points=[];for(let j=0;j<=10;j++){const zz=side*d*j/10;points.push([x+xx,baseY+r.height(xx,zz)+.013*k,z+zz]);}
          tube(points,.011*k,materials.roof,12);
        }
      }
      for(let course=1;course<=7;course++)for(const side of [-1,1]){
        const zz=side*d*course/8,points=[];
        for(let i=-10;i<=10;i++){const xx=w*i/11;points.push([x+xx,baseY+r.height(xx,zz)+.006*k,z+zz]);}
        tube(points,.006*k,materials.roof,20);
      }
      for(const side of [-1,1]){
        const eave=[];for(let i=-12;i<=12;i++){const xx=w*i/12;eave.push([x+xx,baseY+r.height(xx,side*d),z+side*d]);}
        tube(eave,.035*k,materials.gold,28);
        // Individually readable ceramic tile ends beneath the gold fascia.
        for(let i=-11;i<=11;i++)add(sphere,materials.roof,x+w*i/12,baseY+r.height(w*i/12,side*d)-.012*k,z+side*(d+.014*k),.025*k,.022*k,.035*k);
      }
      tube([[x-w*.72,baseY+h*.65,z],[x-w*.42,baseY+h+.04*k,z],[x+w*.42,baseY+h+.04*k,z],[x+w*.72,baseY+h*.65,z]],.033*k,materials.gold,16);
      for(const side of [-1,1])for(const end of [-1,1]){
        tube([[x+side*w*.75,baseY+.05*k,z+end*d*.78],[x+side*w,baseY+.21*k,z+end*d],[x+side*w*1.03,baseY+.34*k,z+end*d*1.025]],.032*k,materials.gold,8);
      }
    }
    stairs([x,y+.02*s,z+1.30*s],[x,y+.26*s,z+.76*s],.78*s,5);
    // Small stone joints break up large foundation slabs.
    for(let i=-5;i<=5;i++)block(materials.rock,x+i*.18*s,y+.09*s,z+.806*s,.009*s,.14*s,.006*s);
  }
  function stairs(a,b,width,steps=20){
    for(let i=0;i<steps;i++){
      const t=(i+.5)/steps,x=THREE.MathUtils.lerp(a[0],b[0],t),y=THREE.MathUtils.lerp(a[1],b[1],t),z=THREE.MathUtils.lerp(a[2],b[2],t);
      const depth=Math.hypot(b[0]-a[0],b[2]-a[2])/steps+.025,angle=Math.atan2(b[0]-a[0],b[2]-a[2]);
      block(materials.ivory,x,y-.075,z,width,.15,depth,angle);
      // Alternating paving joints and a worn stone nosing on every tread.
      block(materials.rock,x+Math.cos(angle)*(i%2?.13:-.13)*width,y+.003,z-Math.sin(angle)*(i%2?.13:-.13)*width,.009,.006,depth*.80,angle);
      block(materials.stone,x-Math.sin(angle)*depth*.39,y+.008,z-Math.cos(angle)*depth*.39,width*.98,.012,.018,angle);
    }
    const d=new THREE.Vector3(b[2]-a[2],0,a[0]-b[0]).normalize().multiplyScalar(width*.54);
    for(const s of [-1,1]){
      beam([a[0]+d.x*s,a[1]+.22,a[2]+d.z*s],[b[0]+d.x*s,b[1]+.22,b[2]+d.z*s],.055,materials.stone);
      for(let i=0;i<=steps;i+=4){const t=i/steps;block(materials.ivory,THREE.MathUtils.lerp(a[0],b[0],t)+d.x*s,THREE.MathUtils.lerp(a[1],b[1],t)+.16,THREE.MathUtils.lerp(a[2],b[2],t)+d.z*s,.09,.38,.09);}
    }
  }
  function terrace(x,y,z,r){disk(materials.stone,x,y-.12,z,r,.24);disk(materials.ivory,x,y+.015,z,r*.97,.08);ring(x,y+.061,z,r*.87);}
  function balustrade(x,y,z,r,start=0,end=tau){
    const count=Math.ceil((end-start)*r/.4);
    const top=[],bottom=[];
    for(let i=0;i<=count;i++){const a=start+(end-start)*i/count,xx=x+Math.cos(a)*r,zz=z+Math.sin(a)*r;block(materials.ivory,xx,y+.20,zz,.09,.4,.09);add(sphere,materials.gold,xx,y+.43,zz,.063);top.push([xx,y+.32,zz]);bottom.push([xx,y+.1,zz]);}
    tube(top,.035,materials.ivory,count*2);tube(bottom,.025,materials.ivory,count*2);
  }
  function bridge(a,b,width=.4,arch=.45){
    const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a),new THREE.Vector3((a[0]+b[0])/2,(a[1]+b[1])/2+arch,(a[2]+b[2])/2),new THREE.Vector3(...b));
    const segments=24,rails=[[],[]],perp=new THREE.Vector3(b[2]-a[2],0,a[0]-b[0]).normalize();
    for(let i=0;i<=segments;i++){
      const p=curve.getPoint(i/segments);block(materials.stone,p.x,p.y,p.z,width,.11,a[2]===b[2]?.20:.26,Math.atan2(b[0]-a[0],b[2]-a[2]));
      for(let side=0;side<2;side++){const s=side*2-1,x=p.x+perp.x*width*.48*s,z=p.z+perp.z*width*.48*s;rails[side].push([x,p.y+.29,z]);if(i%3===0)block(materials.ivory,x,p.y+.17,z,.055,.37,.055);}
    }
    for(const rail of rails)tube(rail,.032,materials.ivory,32);
  }
  function mountainPath(points,width=.24){
    const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,0,z)));
    for(let i=0;i<=90;i++){
      const p=curve.getPoint(i/90),dir=curve.getTangent(i/90),y=heightAt(p.x,p.z);
      block(i%7===0?materials.stone:materials.ivory,p.x,y+.035,p.z,width,.055,.13,Math.atan2(dir.x,dir.z));
      if(i%9===0)block(materials.rock,p.x+dir.z*width*.55,y+.08,p.z-dir.x*width*.55,.07,.14,.10);
    }
  }
  function suspendedBridge(a,b,width=.36){
    const length=Math.hypot(b[0]-a[0],b[2]-a[2]),segments=Math.ceil(length*20),angle=Math.atan2(b[0]-a[0],b[2]-a[2]),nx=Math.cos(angle),nz=-Math.sin(angle),cables=[[],[]];
    for(let i=0;i<=segments;i++){
      const t=i/segments,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
      const y=Math.max(a[1]+(b[1]-a[1])*t-.32*Math.sin(Math.PI*t),heightAt(x,z)+.14);
      block(i%5===0?materials.wood:materials.stone,x,y,z,width,.055,length/segments*.90,angle);
      for(const side of [-1,1]){
        const xx=x+nx*width*.53*side,zz=z+nz*width*.53*side,cy=y+.39+.15*Math.abs(2*t-1);
        cables[(side+1)/2].push([xx,cy,zz]);
        if(i%3===0)beam([xx,y,zz],[xx,cy,zz],.012,materials.wood);
      }
    }
    for(const cable of cables)tube(cable,.021,materials.wood,segments);
    for(const p of [a,b])for(const side of [-1,1]){
      const x=p[0]+nx*width*.56*side,z=p[2]+nz*width*.56*side,g=heightAt(x,z);
      block(materials.stone,x,(p[1]+.57+g)/2,z,.10,p[1]+.57-g,.10);add(sphere,materials.gold,x,p[1]+.61,z,.070);
    }
  }

  // Reference hierarchy: gate → inner court → sky stairs → circular altar → hall.
  block(materials.stone,0,.66,6.55,4.3,.22,1.7);
  hall(0,.79,6.65,1.0,1);hall(-1.45,.8,6.55,.45);hall(1.45,.8,6.55,.45);
  stairs([0,.58,8.35],[0,.8,7.35],1.7,9);
  block(materials.ivory,0,1.72,3.45,3.6,.16,2.3);
  for(const x of [-1.65,1.65])block(materials.stone,x,2.02,3.6,.14,.62,2.4);
  hall(0,1.8,4.23,.74);hall(-1.37,1.81,3.1,.45);hall(1.37,1.81,3.1,.45);
  disk(materials.water,0,1.82,3.2,.67,.026);ring(0,1.845,3.2,.7,materials.gold,.04);
  stairs([0,.8,5.9],[0,1.77,4.92],1.12,16);
  stairs([0,1.8,2.46],[0,4.60,-.27],.84,48);
  terrace(0,4.60,-1.65,1.63);
  for(const r of [.49,.80,1.08,1.41])ring(0,4.66,-1.65,r,materials.gold,.015);
  for(let i=0;i<8;i++){const a=i*tau/8;beam([Math.cos(a)*.82,4.66,-1.65+Math.sin(a)*.82],[Math.cos(a)*1.4,4.66,-1.65+Math.sin(a)*1.4],.012,materials.gold);}
  disk(materials.stone,0,4.76,-1.65,.23,.24);add(new THREE.ConeGeometry(.13,.68,6),materials.crystal,0,5.18,-1.65);
  balustrade(0,4.66,-1.65,1.61,.21,Math.PI-.21);
  stairs([0,4.65,-2.78],[0,6.67,-3.57],1.08,30);
  block(materials.ivory,0,6.52,-4.45,3.5,.18,2.1);
  hall(0,6.65,-4.52,1.24,2);
  hall(-3.2,4.05,-.3,.78,2);hall(3.25,4.05,-.3,.73,3);
  hall(-3.85,2.65,2.5,.62);hall(4.05,2.45,2.5,.66);
  terrace(-3.85,2.66,3.45,.73);balustrade(-3.85,2.72,3.45,.70,0,Math.PI);
  for(let i=0;i<5;i++)beam([-4.28+i*.21,2.72,3.4],[-4.28+i*.21,3.18,3.4],.018,materials.gold);
  terrace(4.4,2.44,3.45,.64);disk(materials.gold,4.4,2.68,3.45,.18,.35);
  // Connected side sanctuaries, bridges, and flank stairs.
  bridge([-1.47,4.66,-1.4],[-2.65,4.12,-.3],.39,.35);
  bridge([1.48,4.66,-1.4],[2.69,4.12,-.3],.39,.35);
  bridge([-3.3,3.99,.72],[-3.85,2.67,1.88],.34,.35);
  bridge([3.3,3.99,.72],[4.05,2.47,1.88],.34,.35);
  stairs([-1.42,1.80,3.57],[-3.32,2.67,3.2],.45,19);
  stairs([1.45,1.80,3.57],[3.55,2.47,3.2],.45,19);
  terrace(-5.45,5.18,-2.55,.60);hall(-5.45,5.24,-2.55,.40,2);
  terrace(5.15,5.64,-2.70,.59);hall(5.15,5.70,-2.70,.42,2);
  bridge([-4.05,4.11,-.85],[-5.22,5.23,-2.04],.34,.38);
  bridge([4.05,4.11,-.9],[5.04,5.69,-2.15],.34,.40);
  bridge([-5.85,1.05,4.3],[-4.83,1.35,5.47],.38,.20);
  bridge([5.4,1.10,3.65],[6.20,1.05,1.50],.38,.22);
  // Satellite shrines occupy different natural shoulders, with contour-following
  // approach paths. Their elevations are sampled, not set on one common plane.
  const shrines=[[-8.7,2.4,.39],[-8.2,-5.8,.31],[9.0,-4.8,.35],[9.5,3.0,.40]];
  root.userData.shrines=[];
  for(const [x,z,s]of shrines){
    let y=heightAt(x,z);
    for(const dx of [-1.15,0,1.15])for(const dz of [-.85,0,.85])y=Math.max(y,heightAt(x+dx*s,z+dz*s));
    hall(x,y+.05,z,s,1);
    root.userData.shrines.push({x,z,y:y+.05,scale:s});
  }
  const leftLanding=[-8.0,heightAt(-8,5.2)+.24,5.2],rightLanding=[8.1,heightAt(8.1,5.8)+.24,5.8];
  suspendedBridge([-4.25,2.76,3.7],leftLanding);
  suspendedBridge([4.75,2.65,3.7],rightLanding);
  mountainPath([[-8,5.2],[-9,4],[-8.7,2.4],[-9.5,.1],[-8.2,-2.3],[-8.2,-5.4]]);
  mountainPath([[8.1,5.8],[9.6,4.4],[9.5,3],[10.1,.8],[9.5,-1.4],[9,-4.4]]);

  // Winding watercourse and tiered falls are modeled ribbons, not billboard PNGs.
  function ribbon(points,width,material){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),p=[],idx=[];
    for(let i=0;i<=64;i++){const t=i/64,v=curve.getPoint(t),dir=curve.getTangent(t),normal=new THREE.Vector3(-dir.z,0,dir.x).normalize();for(const side of [-1,1])p.push(v.x+normal.x*width*.5*side,v.y,v.z+normal.z*width*.5*side);if(i<64){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}}
    const g=meshData(p,idx);add(g,material);g.dispose();
  }
  // The low stream is drawn once by the atlas, all the way to Biluo lake.
  function waterfall(x,z,y,height,width,bend=.70){
    const bottom=Math.max(y-height,heightAt(x,z+bend)+.035);height=Math.max(.16,y-bottom);
    const m=new THREE.MeshStandardMaterial({color:'#aacdca',roughness:.30,metalness:.08,transparent:true,opacity:.79,side:THREE.DoubleSide,depthWrite:false});
    const uniforms={time:{value:0}};
    m.onBeforeCompile=s=>{s.uniforms.uFallTime=uniforms.time;s.vertexShader='varying vec2 vFall;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFall=uv;');s.fragmentShader='varying vec2 vFall; uniform float uFallTime;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float strands=.72+.28*sin(vFall.x*65.+sin(vFall.y*8.-uFallTime)*.6);
      float edge=smoothstep(0.,.20,vFall.x)*(1.-smoothstep(.80,1.,vFall.x));
      diffuseColor.rgb*=.82+.18*strands;
      diffuseColor.a*=edge*strands*(.78+.22*sin(vFall.y*45.-uFallTime*3.));
    `);};
    const points=[],idx=[],uv=[];
    for(let i=0;i<=56;i++)for(let j=0;j<=8;j++){
      const t=i/56,u=j/8,side=u*2-1,w=.5+.13*t+.035*Math.sin(t*21+x);
      points.push(x+side*width*w,y-height*t,z+bend*(.4*t+.6*t*t)+Math.sin(t*32+u*9)*.009);uv.push(u,t);
      if(i<56&&j<8){const a=i*9+j;idx.push(a,a+9,a+1,a+1,a+9,a+10);}
    }
    const geometry=meshData(points,idx);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    const fall=new THREE.Mesh(geometry,m);fall.name='waterfall';root.add(fall);animatedWater.push(uniforms);
    add(sphere,materials.foam,x,y-height+.045,z+bend,width*.83,.035,width*.5);
    for(let i=0;i<5;i++)ring(x+(rand(i,x)-.5)*width,y-height+.04,z+bend+(rand(i,z)-.5)*width,.08+rand(i,6)*.12,materials.foam,.012);
  }
  for(const x of [-1.38,1.38]){
    ribbon([[x,6.53,-4.12],[x,6.53,-3.80],[x,6.53,-3.49]],.25,materials.water);
    waterfall(x,-3.49,6.53,5.90,.27,.87);
  }
  waterfall(-3.92,.79,4.08,3.45,.38,.70);waterfall(3.93,.76,4.08,3.45,.34,.70);
  waterfall(-4.3,3.68,2.69,2.06,.34,.66);waterfall(4.58,3.53,2.50,1.87,.31,.66);

  // Miniature bent pines (trunk + tiered clustered crowns), not cone placeholders.
  const greens=['#345943','#47694a','#5d794c','#73854e'].map(c=>mat(c));
  const reds=['#945044','#ba6943','#caa254'].map(c=>mat(c));
  function pine(x,y,z,s,seed,autumn=false){
    y=Math.max(y,heightAt(x,z)+.025);
    const bend=(rand(seed,2)-.5)*.4*s,c=autumn?reds[Math.floor(rand(seed,4)*3)]:greens[Math.floor(rand(seed,4)*4)];
    tube([[x,y,z],[x+bend*.2,y+s*.5,z],[x+bend,y+s*.95,z]],.034*s,materials.wood,8);
    for(let j=0;j<5;j++){
      const a=j*2.4+rand(seed)*tau,yy=y+s*(.48+j*.095),d=s*(.32-j*.025);
      const xx=x+bend*j/5+Math.cos(a)*d,zz=z+Math.sin(a)*d;
      beam([x+bend*j/5,yy-.12*s,z],[xx,yy,zz],.018*s,materials.wood);
      for(let k=0;k<3;k++)add(leaf,c,xx+Math.cos(k*2.1)*d*.27,yy+rand(seed+k)*s*.05,zz+Math.sin(k*2.1)*d*.25,d*.76,s*.11,d*.56,seed);
    }
    add(leaf,c,x+bend,y+s*1.02,z,s*.2,s*.13,s*.2);
  }
  const gardens=[[-6.6,.60,2.5],[-6.5,.6,3.7],[-4.5,.6,5.3],[-3,.6,6.7],[2.8,.6,6.6],[4,.6,5.6],[6.4,.6,2.5],[6.65,.6,.7],[-7.2,.6,-1.7],[7.1,.6,-1.6],[-2.15,1.78,2.9],[2.15,1.78,3.3],[-4.8,2.62,2.2],[4.9,2.44,2.1],[-4,4.03,-1],[4.1,4.03,-1.1],[-1.6,6.55,-4.5],[1.6,6.55,-4.5],[-2.1,4.6,-1.7],[2.1,4.6,-1.5]];
  gardens.forEach(([x,y,z],i)=>pine(x,y,z,.65+rand(i)*.5,i,i%5===2));
  mountainGardens.forEach(([x,y,z,s,seed])=>pine(x,y,z,s,seed));
  for(let i=0;i<260;i++){
    const x=(rand(i,21)-.5)*25,z=(rand(i,42)-.5)*25;
    if(Math.abs(x)<2.9&&z> -7&&z<9||Math.abs(x)<5.1&&z<4.4&&z> -6)continue;
    if(z>4&&streamSample(x,z).distance<.8)continue;
    pine(x,.6,z,.5+rand(i,43)*.48,i+71,i%11===0);
  }
  // Rock ledges and moss add scale cues at the base of cliffs.
  for(let i=0;i<330;i++){
    const x=(rand(i,34)-.5)*26,z=(rand(i,89)-.5)*28;
    if(Math.abs(x)<2.3&&z> -5&&z<9)continue;
    if(z>4&&streamSample(x,z).distance<.6)continue;
    add(leaf,i%4===0?materials.grass:materials.rock,x,heightAt(x,z)+.06,z,.12+rand(i,9)*.19,.10+rand(i,6)*.25,.15+rand(i,7)*.20,i);
  }
  // Narrow stratified rock ledges follow slope contours instead of scattering
  // only round boulders. Reeds and bank stones emphasize the smaller water scale.
  for(let i=0;i<220;i++){
    const x=(rand(i,93)-.5)*33,z=(rand(i,96)-.58)*38,y=heightAt(x,z);
    if(Math.abs(x)<5.3&&z>-6.8&&z<7)continue;
    const dx=heightAt(x+.12,z)-heightAt(x-.12,z),dz=heightAt(x,z+.12)-heightAt(x,z-.12),slope=Math.hypot(dx,dz)/.24;
    if(slope<.75||slope>4.5)continue;
    for(let k=0;k<3;k++)add(leaf,k===2?materials.darkRock:materials.rock,x,y-.04+k*.065,z,.25+rand(i)*.28,.05,.11+rand(i,7)*.16,Math.atan2(dx,dz));
  }
  for(let i=0;i<180;i++){
    const x=(rand(i,82)-.25)*20,z=4+rand(i,85)*18,sample=streamSample(x,z);
    if(sample.distance<sample.width+.05||sample.distance>sample.width+.43)continue;
    const y=heightAt(x,z);
    add(leaf,materials.rock,x,y+.03,z,.07,.055,.09,i);
    for(let j=0;j<3;j++)beam([x+j*.028,y,z],[x+j*.028+.025,y+.13+rand(i,j)*.10,z+.045],.007,greens[i%4]);
  }
  // Herb plots, pavilion, stone lanterns and blue spiritual nodes.
  for(let i=0;i<5;i++){
    block(materials.stone,4.1+i*.20,.68,4.65,.14,.08,.7,-.15);
    for(let j=0;j<7;j++)add(leaf,greens[j%4],4.1+i*.20,.76,4.38+j*.085,.065,.11,.055);
  }
  hall(-4.55,.65,5.55,.32);
  for(const [x,z,y] of [[-1.1,7.45,.66],[1.1,7.45,.66],[-1.26,4.68,1.79],[1.26,4.68,1.79],[-1.05,-3.68,6.5],[1.05,-3.68,6.5]]){
    disk(materials.stone,x,y+.07,z,.12,.14,8);block(materials.stone,x,y+.27,z,.095,.4,.095);block(materials.gold,x,y+.48,z,.18,.15,.18);add(new THREE.ConeGeometry(.16,.16,4),materials.roof,x,y+.63,z);
  }
  for(const [x,y,z] of [[-5.7,2.8,-1.4],[5.85,2.4,-.9],[.25,10.85,-6.3]]){
    const g=new THREE.OctahedronGeometry(.19,0);add(g,materials.crystal,x,y,z,1,2.2,1);g.dispose();
  }

  for(const [material,data] of batches){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(data.n,3));g.computeBoundingSphere();g.computeBoundingBox();
    const mesh=new THREE.Mesh(g,material);mesh.name='miniature-'+(Object.keys(materials).find(k=>materials[k]===material)||'foliage');mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  }
  for(const g of [box,cylinder,leaf,sphere,...[...roofCache.values()].map(r=>r.g)])g.dispose();
  root.updateMatrixWorld(true);
  root.userData.bounds=new THREE.Box3().setFromObject(root);
  return {
    group:root,
    update(seconds){for(const uniforms of animatedWater)uniforms.time.value=seconds;},
    features:XUANTIAN_FEATURES.map(f=>({...f,x:f.x*scale,y:f.y*scale,z:f.z*scale})),
  };
}
