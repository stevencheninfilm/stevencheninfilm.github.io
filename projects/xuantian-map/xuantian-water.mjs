import * as THREE from '../../assets/vendor/three-0.160.0/three.module.js';
import {SECT_SCALE,STREAM_CURVES,streamLevel,streamSurfaceData} from './xuantian-landscape.mjs';

// Local world-space geometry. Water and banks use exactly the same curved
// samples as the terrain carver; no painted lines or billboard strips.
export function createSectStream({base,groundAt}){
 const group=new THREE.Group();group.name='xuantian-biluo-stream';
 const data=streamSurfaceData(base),geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uv,2));geometry.computeVertexNormals();
 const time={value:0},material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.38,metalness:.13});
 material.onBeforeCompile=s=>{
  s.uniforms.uStreamTime=time;
  s.vertexShader='varying vec2 vStreamUV;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvStreamUV=uv;');
  s.fragmentShader='varying vec2 vStreamUV; uniform float uStreamTime;\n'+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float ripples=sin(vStreamUV.y*34.-uStreamTime*1.7+sin(vStreamUV.x*27.+vStreamUV.y*3.)*.6);
   float flow=pow(max(0.,sin(vStreamUV.y*11.-uStreamTime*.8)),18.)*.06;
   diffuseColor.rgb*=.96+ripples*.035;
   diffuseColor.rgb+=flow*smoothstep(.05,.35,vStreamUV.x)*(1.-smoothstep(.65,.95,vStreamUV.x));
  `);
 };
 const water=new THREE.Mesh(geometry,material);water.name='spline-water';water.receiveShadow=true;group.add(water);
 const bankPositions=[],bankColors=[];
 const bankWidth=(curve,index,side)=>{
  const a=curve[Math.max(0,index-1)],b=curve[Math.min(curve.length-1,index+1)],p=curve[index];
  const radius=(b.length-a.length)/Math.max(.0001,Math.hypot(b.nx-a.nx,b.nz-a.nz));
  // A tight inside bend cannot support a bank wider than its curvature radius.
  return Math.max(1.04,Math.min(1.72,radius*.72/(p.width*(side<0?p.left:p.right))));
 };
 for(const curve of STREAM_CURVES)for(let i=0;i<curve.length-1;i++)for(const side of [-1,1]){
  const quad=[];
  for(const index of [i,i+1])for(const band of [1.01,bankWidth(curve,index,side)]){
   const p=curve[index];
   const width=p.width*(side<0?p.left:p.right),x=(p.x+p.nx*width*band*side)*SECT_SCALE,z=(p.z+p.nz*width*band*side)*SECT_SCALE;
   const grain=.93+.07*Math.sin(p.length*1.7+side);
   quad.push({p:[x,Math.max(groundAt(x,z)+.006,streamLevel(p.progress,base)-.005+(band-1)*.014),z],c:(band<1.5?[.12,.17,.115]:[.18,.23,.14]).map(c=>c*grain)});
  }
  for(const k of side>0?[0,1,2,1,3,2]:[0,2,1,1,2,3]){bankPositions.push(...quad[k].p);bankColors.push(...quad[k].c);}
 }
 const banks=new THREE.BufferGeometry();banks.setAttribute('position',new THREE.Float32BufferAttribute(bankPositions,3));banks.setAttribute('color',new THREE.Float32BufferAttribute(bankColors,3));banks.computeVertexNormals();
 const bankMesh=new THREE.Mesh(banks,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95}));bankMesh.name='wet-river-banks';bankMesh.receiveShadow=true;group.add(bankMesh);
 return {group,update(seconds){time.value=seconds;}};
}
