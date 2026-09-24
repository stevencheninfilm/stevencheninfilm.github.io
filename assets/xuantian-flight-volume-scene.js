/* Deterministic, closed 3D rock meshes and a spatially evaluated volume scene.
   No PNG silhouettes, billboards, time-based mountain dissolves or CDN assets. */
((root,factory)=>{
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./xuantian-flight.js'));
  else root.XuantianVolumeScene=factory(root.XuantianFlight);
})(typeof window==='undefined'?globalThis:window,flight=>{
  const speed=1.2,duration=7200/speed,startDelay=450/speed;
  const ease=t=>flight.ease(t,[.48,0,.52,1]);
  const clamp=t=>Math.max(0,Math.min(1,t));
  const sample=elapsed=>{
    const time=clamp(elapsed/duration),progress=ease(time);
    return {time,progress,camera:[Math.sin(progress*Math.PI)*65,80+progress*135,1300-4500*progress],
      yaw:Math.sin(progress*Math.PI)*-.022,pitch:Math.sin(progress*Math.PI)*.012};
  };
  const mountains=[];
  const add=(x,z,height,radius,seed,base=-1350)=>mountains.push({x,z,height,radius,seed,base});
  for(const side of [-1,1]){
    add(side*700,130,1570,260,side+4);
    add(side*1030,30,1780,310,side+8);
    add(side*490,-160,1080,200,side+12);
    add(side*830,-820,1560,330,side+16);
    add(side*1100,-1050,1810,300,side+20);
    add(side*770,-1710,1330,280,side+24);
    add(side*1190,-1920,1650,400,side+28);
  }
  add(-180,-1600,1050,260,40,-1600);
  add(250,-2070,1000,250,44,-1600);
  const clouds=[
    [0,-120,410,820,510,330],[-650,530,320,820,620,400],[560,560,260,940,610,410],
    [-900,-60,240,800,600,540],[880,-130,110,840,550,560],
    [-750,-530,-540,1080,540,650],[780,-490,-650,1100,590,630],[0,-750,-420,1000,520,740],
    [-1080,-420,-1350,1050,620,630],[1060,-400,-1400,1100,570,600],
    [-380,-790,-1650,1000,660,720],[480,-840,-2110,950,620,620],
    [-1200,-620,-2200,920,560,570],[1380,-590,-2060,940,550,500]
  ];
  function buildMountain(m,segments=64,rings=48){
    const positions=[],indices=[],normals=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    const vertex=(x,y,z)=>{positions.push(x,y,z);normals.push(0,0,0);[x,y,z].forEach((n,i)=>{bounds.min[i]=Math.min(bounds.min[i],n);bounds.max[i]=Math.max(bounds.max[i],n);});};
    const hash=(x,y)=>{let h=Math.imul(x+41*m.seed,374761393)^Math.imul(y,668265263);h=Math.imul(h^(h>>>13),1274126177);return (h>>>0)/4294967295;};
    const noise=(x,y)=>{const a=Math.floor(x),b=Math.floor(y);let u=x-a,v=y-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v;};
    const heightAt=(x,z,r)=>{
      const rotate=m.seed*.73,c=Math.cos(rotate),s=Math.sin(rotate),u=x*c+z*s,v=z*c-x*s;
      const peaks=Math.max(Math.exp(-((u+.26)**2+(v-.05)**2)*4),.91*Math.exp(-((u-.40)**2+(v+.23)**2)*13),.76*Math.exp(-((u+.05)**2+(v-.58)**2)*18));
      const ridge=1-Math.abs(noise(u*5,v*5)*2-1),fine=noise(u*19,v*19);
      const shelf=.46+peaks*.46+ridge*.10+(fine-.5)*.045;
      return Math.pow(Math.max(0,1-r**6),.22)*shelf*m.height;
    };
    // A multi-summit radial heightfield with a sealed base, not an extruded PNG.
    vertex(m.x,m.base+heightAt(0,0,0),m.z);
    for(let j=1;j<=rings;j++)for(let i=0;i<segments;i++){
      const r=j/rings,a=i/segments*Math.PI*2,x=Math.cos(a)*r,z=Math.sin(a)*r;
      const erosion=1+.15*Math.sin(a*7+m.seed)+.065*Math.sin(a*17+m.seed*2)+.035*Math.sin(a*37);
      vertex(m.x+x*m.radius*erosion,m.base+heightAt(x,z,r),m.z+z*m.radius*.87*erosion);
    }
    const bottom=positions.length/3;vertex(m.x,m.base,m.z);
    for(let i=0;i<segments;i++)indices.push(0,1+(i+1)%segments,1+i);
    for(let j=0;j<rings-1;j++)for(let i=0;i<segments;i++){
      const a=1+j*segments+i,b=1+j*segments+(i+1)%segments,c=a+segments,d=b+segments;
      indices.push(a,b,c,b,d,c);
    }
    for(let i=0;i<segments;i++)indices.push(bottom,1+(rings-1)*segments+i,1+(rings-1)*segments+(i+1)%segments);
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
      const u=[0,1,2].map(k=>positions[b+k]-positions[a+k]),v=[0,1,2].map(k=>positions[c+k]-positions[a+k]);
      const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      for(const k of [a,b,c])for(let axis=0;axis<3;axis++)normals[k+axis]+=n[axis];
    }
    const data=new Float32Array(positions.length*2);
    for(let i=0;i<positions.length;i+=3){
      const len=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
      for(let k=0;k<3;k++){data[i*2+k]=positions[i+k];data[i*2+3+k]=normals[i+k]/len;}
    }
    return {data,indices:new Uint16Array(indices),bounds};
  }
  function project(p,state,width,height){
    let x=p[0]-state.camera[0],y=p[1]-state.camera[1],z=p[2]-state.camera[2];
    [x,z]=[x*Math.cos(state.yaw)+z*Math.sin(state.yaw),-x*Math.sin(state.yaw)+z*Math.cos(state.yaw)];
    [y,z]=[y*Math.cos(state.pitch)+z*Math.sin(state.pitch),-y*Math.sin(state.pitch)+z*Math.cos(state.pitch)];
    if(z>=-12)return null;
    const focal=height*.96;
    return [width*.5+x*focal/-z,height*.43-y*focal/-z];
  }
  // Fade only the final sliver crossing the viewport, never an in-frame mountain.
  function mountainAlpha(bounds,state,width,height){
    const points=[];
    for(let i=0;i<8;i++){
      const p=project([bounds[i&1?'max':'min'][0],bounds[i&2?'max':'min'][1],bounds[i&4?'max':'min'][2]],state,width,height);
      if(p)points.push(p);
    }
    if(!points.length)return 0;
    const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
    const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));
    const visibleX=Math.max(0,Math.min(width,maxX)-Math.max(0,minX));
    const visibleY=Math.max(0,Math.min(height,maxY)-Math.max(0,minY));
    if(!visibleX||!visibleY)return 0;
    const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
    if(centerX>=0&&centerX<=width&&centerY>=0&&centerY<=height)return 1;
    const edge=Math.min(visibleX/Math.min(width,maxX-minX),visibleY/Math.min(height,maxY-minY));
    return ease(clamp(edge/.12));
  }
  return {sample,ease,speed,duration,startDelay,titleAt:800/speed,endAt:duration+startDelay,mountains,clouds,buildMountain,project,mountainAlpha};
});
