// Continuous terrain in sect art units, shared by map tessellation, foundations,
// trees, paths and offline QA. No hex clipping, pedestal, or cell-specific height.
export const SECT_SCALE=.58;
export const SECT_CORE_RADIUS=5.8;
export const SECT_BLEND_RADIUS=30;
export const PLATEAUS=[
 [0,-4.55,2.45,1.75,5.92],[0,-1.48,2.25,1.75,3.99],[0,3.3,2.4,2,1.12],
 [-3.25,-.3,1.8,1.65,3.45],[3.3,-.4,1.8,1.7,3.45],
 [-3.85,2.5,1.7,1.8,2.02],[4.1,2.5,1.65,1.65,1.82],
 [-5.45,-2.55,.76,.80,4.58],[5.15,-2.7,.78,.85,5.05],
];
export const PEAKS=[
 [-5.5,-3.8,1.65,1.9,6.55],[5.2,-4.1,1.65,1.8,7.3],
 [-2.1,-6,1.3,1.45,8.5],[.25,-6.3,1.62,1.8,10.4],
 [2.3,-5.85,1.08,1.4,8.2],[-6.5,-.55,1.06,1.6,4.2],[6.45,-.75,1.18,1.4,4.6],
];
const clamp=t=>Math.max(0,Math.min(1,t));
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*t*(t*(t*6-15)+10);};
function erosionNoise(x,z){
 const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
 const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
 const a=hash(ix,iz),b=hash(ix+1,iz),c=hash(ix,iz+1),d=hash(ix+1,iz+1);
 return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
// Cubic interpolation is shared by ridge spines and river centerlines.
const cubic=(a,b,c,d,t)=>b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));
function spline(path,steps){
 const result=[];
 for(let i=0;i<path.length-1;i++)for(let j=0;j<steps;j++){
  const a=path[Math.max(0,i-1)],b=path[i],c=path[i+1],d=path[Math.min(path.length-1,i+2)],t=j/steps;
  result.push(b.map((_,k)=>cubic(a[k],b[k],c[k],d[k],t)));
 }
 result.push([...path.at(-1)]);return result;
}
// X / Z / height / shoulder width. Long connected spines replace isolated
// Gaussian mounds, with readable saddles continuing well beyond the sect.
export const RIDGE_CHAINS=[
 [[0,-6,8.2,3.0],[-4,-10,6.8,3.8],[-8,-17,7.8,4.5],[-16,-25,6.3,5.1],[-24,-36,4.7,6.4]],
 [[0,-6,7.3,3.0],[6,-11,6.1,3.8],[12,-18,7.4,4.9],[23,-25,5.5,6.2],[35,-30,3.9,7.0]],
 [[-5,-4,4.2,3.3],[-10,-2,3.8,3.9],[-15,4,3.4,4.8],[-20,12,2.7,5.2],[-27,22,1.2,6.6]],
 [[5,-4,4.7,3.4],[11,0,4.1,4.0],[16,6,3.3,4.6],[24,10,2.5,5.7],[34,16,1.1,7.1]],
 [[-8,-17,5.5,4.0],[-18,-14,4.8,5.0],[-30,-12,3.4,6.0],[-41,-18,2.1,7.0]],
];
const ridgeBuckets=new Map();
for(const chain of RIDGE_CHAINS){
 const points=spline(chain,6);
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1],pad=Math.max(a[3],b[3])*2.7,dx=b[0]-a[0],dz=b[1]-a[1];
  const segment={a,b,dx,dz,length2:dx*dx+dz*dz};
  for(let x=Math.floor((Math.min(a[0],b[0])-pad)/6);x<=Math.floor((Math.max(a[0],b[0])+pad)/6);x++)
   for(let z=Math.floor((Math.min(a[1],b[1])-pad)/6);z<=Math.floor((Math.max(a[1],b[1])+pad)/6);z++){
    const key=x+z*1000;if(!ridgeBuckets.has(key))ridgeBuckets.set(key,[]);ridgeBuckets.get(key).push(segment);
   }
 }
}
export function ridgeHeight(x,z){
 let h=0;
 for(const {a,b,dx,dz,length2}of ridgeBuckets.get(Math.floor(x/6)+Math.floor(z/6)*1000)||[]){
  const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/length2),width=a[3]+(b[3]-a[3])*t;
  const distance2=(x-a[0]-t*dx)**2+(z-a[1]-t*dz)**2;
  const peak=a[2]+(b[2]-a[2])*t;
  h=Math.max(h,peak*Math.exp(-distance2/(width*width)*1.25));
 }
 return h*(.89+.14*erosionNoise(x*.55,z*.55)+.08*erosionNoise(x*1.8+41,z*1.8-29));
}
export function sectInfluence(dx,dz){
 return (1-smooth(12,SECT_BLEND_RADIUS,Math.hypot(dx,dz)))*(1-smooth(12,20,dz));
}
export function sectCore(dx,dz){return Math.hypot(dx/(SECT_CORE_RADIUS*.89),dz/SECT_CORE_RADIUS)<1;}
export function sectLocalHeight(x,z){
 let height=.54+ridgeHeight(x,z);
 for(let i=0;i<PEAKS.length;i++){
  const [px,pz,rx,rz,h]=PEAKS[i],dx=(x-px)/rx,dz=(z-pz)/rz,a=Math.atan2(dz,dx);
  const flutes=1+.10*Math.sin(a*7+i)+.06*Math.sin(a*13+z*2.1);
  const d=Math.hypot(dx,dz)/flutes;
  const peak=h*Math.pow(Math.max(0,1-Math.pow(d/1.35,.85)),.62);
  height=Math.max(height,.54+peak);
 }
 for(let i=0;i<PLATEAUS.length;i++){
  const [px,pz,rx,rz,h]=PLATEAUS[i],dx=(x-px)/rx,dz=(z-pz)/rz,a=Math.atan2(dz,dx);
  const d=Math.hypot(dx,dz)/(1+.028*Math.sin(a*11+i));
  // Long talus aprons join each terrace to its neighbors instead of ending as
  // a cylindrical cliff. The central floor is then cut into the natural hill.
  let shelf=.54+h*(.32*Math.exp(-d*d*.36)+.68*(1-smooth(.66,1.30,d)));
  // Rock-cut channel beneath the continuous upper ceremonial staircase.
  if(i===0&&Math.abs(x)<.70&&z> -3.61){
   const stair=4.65+clamp((-2.78-z)/.79)*2.02-.16;
   shelf=Math.min(shelf,stair);
  }
  height=Math.max(height,shelf);
 }
 for(const [px,pz,rx,rz,h]of PLATEAUS){
  const d=Math.hypot((x-px)/rx,(z-pz)/rz),cut=1-smooth(.64,.93,d);
  height+=(Math.min(height,.54+h)-height)*cut;
 }
 // The ceremonial stair is cut into a connected ridge, not suspended between
 // two separate platforms. Its shoulders taper into the flanking ravines.
 if(z>=-.27&&z<=2.46){
  const stair=1.8+(2.46-z)/2.73*2.8-.12;
  height=Math.max(height,.54+(stair-.54)*(1-smooth(.48,1.80,Math.abs(x))));
  height+=(stair-height)*(1-smooth(.44,.70,Math.abs(x)));
 }
 if(z>=4.92&&z<=5.90){
  const stair=.8+(5.90-z)/.98*.97-.12;
  height=Math.max(height,.54+(stair-.54)*(1-smooth(.63,1.55,Math.abs(x))));
  height+=(stair-height)*(1-smooth(.62,.88,Math.abs(x)));
 }
 if(z>=-3.61&&z<=-2.78){
  const stair=4.65+clamp((-2.78-z)/.79)*2.02-.12;
  height+=(Math.min(height,stair)-height)*(1-smooth(.59,.78,Math.abs(x)));
 }
 const grain=(Math.sin(x*19.1+z*9.3)*Math.sin(z*13.4-x*5.2))*.035;
 // Flat building pads must not acquire noisy bumps through their stone floors.
 return height+(height<.6?Math.sin(x*.7)*Math.sin(z*.5)*.016:0)+grain*smooth(.8,2,height)*(1-smooth(3.9,4.1,height));
}
export function sectHeight(x,z,naturalHeight,center,base){
 const dx=x-center.x,dz=z-center.z,w=sectInfluence(dx,dz);
 if(w===0)return naturalHeight;
 let target=base+(sectLocalHeight(dx/SECT_SCALE,dz/SECT_SCALE)-.54)*SECT_SCALE;
 // Preserve the atlas's existing mountains outside the architectural core.
 // Extended ridges raise connecting saddles, never flatten the wider range.
 target+=(Math.max(target,naturalHeight)-target)*smooth(6,13,Math.hypot(dx,dz));
 return naturalHeight+(target-naturalHeight)*w;
}
// Curved centerlines are the one source for river mesh, riverbed, banks and
// riparian planting. No independent straight segments or constant-width stripe.
export const STREAM_PATHS=[
 [[-4.3,4.34],[-4.85,5.4],[-3.7,6.35],[-2.1,6.6],[-1.1,8.4],[.4,10.8],[3.6,13],[4.6,16.2],[9.2,18.2],[11.1,21.4],[15.5,23.0]],
 [[4.58,4.19],[5.3,5.55],[4.35,7.15],[2.1,8.5],[.4,10.8]],
];
export const STREAM_CURVES=STREAM_PATHS.map((path,branch)=>{
 const points=spline(path.map(([x,z],i)=>[x,z,i/(path.length-1)*(branch===0?1:.5)]),32);
 let length=0;
 return points.map(([x,z,progress],i)=>{
  const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[1]-a[1],d=Math.hypot(dx,dz);
  if(i)length+=Math.hypot(x-points[i-1][0],z-points[i-1][1]);
  const width=.20+.085*progress+.026*Math.sin(length*.75)+.014*Math.sin(length*1.9);
  const left=.98+.12*Math.sin(length*.91+2),right=.98+.13*Math.sin(length*.67);
  return {x,z,progress,nx:-dz/d,nz:dx/d,width,left,right,length};
 });
});
const riverBuckets=new Map();
for(const [branch,curve]of STREAM_CURVES.entries())for(let i=0;i<curve.length-1;i++){
 const a=curve[i],b=curve[i+1],dx=b.x-a.x,dz=b.z-a.z,segment={a,b,dx,dz,length2:dx*dx+dz*dz,branch};
 for(let x=Math.floor((Math.min(a.x,b.x)-3)/2);x<=Math.floor((Math.max(a.x,b.x)+3)/2);x++)
  for(let z=Math.floor((Math.min(a.z,b.z)-3)/2);z<=Math.floor((Math.max(a.z,b.z)+3)/2);z++){
   const key=x+z*1000;if(!riverBuckets.has(key))riverBuckets.set(key,[]);riverBuckets.get(key).push(segment);
  }
}
export function streamSample(x,z){
 let best={distance:Infinity,progress:0,width:.2};
 for(const {a,b,dx,dz,length2}of riverBuckets.get(Math.floor(x/2)+Math.floor(z/2)*1000)||[]){
  const t=clamp(((x-a.x)*dx+(z-a.z)*dz)/length2),distance=Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
  if(distance<best.distance)best={distance,progress:a.progress+(b.progress-a.progress)*t,width:(a.width+(b.width-a.width)*t)*Math.max(a.left+(b.left-a.left)*t,a.right+(b.right-a.right)*t)};
 }
 return best;
}
export function streamLevel(progress,base){return base+.027+(.146-base-.027)*smooth(.1,1,progress);}
export function streamSurfaceData(base){
 const positions=[],colors=[],uv=[],lanes=[-1,-.86,-.55,0,.55,.86,1];
 // Linear-light teal depth colors: muted shallow edges, darker moving channel.
 const edge=[.18,.28,.22],deep=[.027,.12,.13];
 const vertex=(p,u)=>{
  const depth=1-Math.pow(Math.abs(u),2),c=deep.map((v,i)=>v*depth+edge[i]*(1-depth));
  const width=p.width*(u<0?p.left:p.right);
  return {p:[(p.x+p.nx*width*u)*SECT_SCALE,streamLevel(p.progress,base),(p.z+p.nz*width*u)*SECT_SCALE],c,uv:[(u+1)/2,p.length]};
 };
 for(const curve of STREAM_CURVES)for(let i=0;i<curve.length-1;i++)for(let j=0;j<lanes.length-1;j++){
  const quad=[vertex(curve[i],lanes[j]),vertex(curve[i],lanes[j+1]),vertex(curve[i+1],lanes[j]),vertex(curve[i+1],lanes[j+1])];
  for(const k of [0,1,2,1,3,2]){positions.push(...quad[k].p);colors.push(...quad[k].c);uv.push(...quad[k].uv);}
 }
 // A small confluence pool covers the meeting of both smooth bank normals.
 for(const p of [STREAM_CURVES[0][160],...STREAM_CURVES.map(c=>c[0])]){
  for(let i=0;i<32;i++){
   const a=i*Math.PI/16,b=(i+1)*Math.PI/16;
   for(const [dx,dz]of [[0,0],[Math.cos(b)*p.width,Math.sin(b)*p.width],[Math.cos(a)*p.width,Math.sin(a)*p.width]]){
    positions.push((p.x+dx)*SECT_SCALE,streamLevel(p.progress,base),(p.z+dz)*SECT_SCALE);colors.push(...deep);uv.push(.5,p.length);
   }
  }
 }
 return {positions,colors,uv};
}
export const streamMeshData=base=>streamSurfaceData(base).positions;
export function carveSectStream(x,z,height,center,base){
 const lx=(x-center.x)/SECT_SCALE,lz=(z-center.z)/SECT_SCALE;
 if(lz<1||lz>27||lx< -9||lx>19)return height;
 const {distance,progress,width}=streamSample(lx,lz);
 if(distance>2.6)return height;
 const water=streamLevel(progress,base);
 // Shallow inset banks dissolve into a wider V-shaped ravine, not a trench with
 // parallel walls. The river surface is always above the submerged center.
 const bed=water-.055+Math.max(0,distance-width*.90)*.24;
 const blend=1-smooth(width+.08,2.6,distance);
 return height+(Math.min(height,bed)-height)*blend;
}
