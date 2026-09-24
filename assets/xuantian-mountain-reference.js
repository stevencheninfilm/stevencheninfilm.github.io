/* Image-guided mountain reconstruction. Front UVs and silhouette come from the
   original photographs. Depth is inferred relief, NOT a recovered multi-view
   scan; the sealed back is an approximation. No source image is modified. */
((root,factory)=>{
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.XuantianMountainReference=factory();
})(typeof window==='undefined'?globalThis:window,()=>{
  const definitions=[
    {name:'far',x:.50,y:.53,size:210,z:-2090,projection:800/1480,brightness:.96},
    {name:'middle',x:.50,y:.64,size:142,z:-1170,projection:800/1220,brightness:.88},
    {name:'left',x:.11,y:.57,size:65,z:0,projection:800/920,brightness:.84},
    {name:'right',x:.92,y:.60,size:65,z:-80,projection:800/920,brightness:.84}
  ];
  const clamp=v=>Math.max(0,Math.min(1,v));
  function build(pixels,width,height,relief=true){
    const n=width*height,mask=new Uint8Array(n),distance=new Float32Array(n),luma=new Float32Array(n);
    for(let i=0;i<n;i++){
      mask[i]=pixels[i*4+3]>8?1:0;
      distance[i]=mask[i]?Math.min(i%width,width-1-i%width,Math.floor(i/width),height-1-Math.floor(i/width),999):0;
      luma[i]=(pixels[i*4]*.2126+pixels[i*4+1]*.7152+pixels[i*4+2]*.0722)/255;
    }
    // Chamfer distance preserves the photographed outline; broad interior
    // masses get depth while tiny pine silhouettes remain attached to it.
    for(let y=1;y<height;y++)for(let x=1;x<width;x++){
      const i=y*width+x;distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-width]+1,distance[i-width-1]+1.414);
    }
    for(let y=height-2;y>=0;y--)for(let x=width-2;x>=0;x--){
      const i=y*width+x;distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+width]+1,distance[i+width+1]+1.414);
    }
    const depths=new Float32Array(n);
    for(let i=0;i<n;i++)depths[i]=relief?.075*Math.sin(clamp(distance[i]/(width*.13))*Math.PI/2)*(.9+.1*luma[i]):0;
    const vertices=[],indices=[],edges=new Map(),used=new Map();
    const vertex=i=>{
      if(used.has(i))return used.get(i);
      const id=vertices.length/9,u=(i%width)/(width-1),v=Math.floor(i/width)/(height-1);
      vertices.push(u-.5,.5-v,depths[i],0,0,0,u,v,0);used.set(i,id);return id;
    };
    const triangle=(a,b,c)=>{
      const ids=[a,b,c].map(vertex);indices.push(...ids);
      for(let k=0;k<3;k++){const x=ids[k],y=ids[(k+1)%3],key=Math.min(x,y)+':'+Math.max(x,y);if(edges.has(key))edges.delete(key);else edges.set(key,[x,y]);}
    };
    for(let y=0;y<height-1;y++)for(let x=0;x<width-1;x++){
      const a=y*width+x,b=a+1,c=a+width,d=c+1;
      if(mask[a]||mask[b]||mask[c])triangle(a,c,b);
      if(mask[b]||mask[c]||mask[d])triangle(b,c,d);
    }
    const frontCount=vertices.length/9,frontIndices=indices.length;
    if(relief){
      for(let i=0;i<frontCount;i++){
        // Taper the inferred back into the actual contour. A uniformly thick
        // extrusion exposes a second photographic silhouette during fly-by.
        const p=vertices.slice(i*9,i*9+9);p[2]=-.004-p[2]*.65;p[8]=1;vertices.push(...p);
      }
      for(let i=0;i<frontIndices;i+=3)indices.push(indices[i+2]+frontCount,indices[i+1]+frontCount,indices[i]+frontCount);
      for(const [a,b] of edges.values())indices.push(b,a,a+frontCount,b,a+frontCount,b+frontCount);
    }
    for(let i=0;i<indices.length;i+=3){
      const a=indices[i]*9,b=indices[i+1]*9,c=indices[i+2]*9;
      const ux=vertices[b]-vertices[a],uy=vertices[b+1]-vertices[a+1],uz=vertices[b+2]-vertices[a+2];
      const vx=vertices[c]-vertices[a],vy=vertices[c+1]-vertices[a+1],vz=vertices[c+2]-vertices[a+2];
      const normal=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
      for(const j of [a,b,c])for(let k=0;k<3;k++)vertices[j+3+k]+=normal[k];
    }
    for(let i=0;i<vertices.length;i+=9){const length=Math.hypot(...vertices.slice(i+3,i+6))||1;for(let k=3;k<6;k++)vertices[i+k]/=length;}
    return {data:new Float32Array(vertices),indices:new Uint32Array(indices),frontCount,closed:relief};
  }
  function placement(def,width,height,aspect=4/3){
    const unit=Math.max(width*.01,height*(width<=760?.0048:.0062));
    const distance=1300-def.z,w=def.size*unit*def.projection*distance/(height*.96),h=w/aspect;
    return {center:[(def.x-.5)*width*distance/(height*.96),80+(.43-def.y)*height*distance/(height*.96),def.z],size:[w,h]};
  }
  // Correct each vertex for its depth so the initial camera sees the exact UV
  // composition. Subsequent camera movement produces real surface parallax.
  function worldPoint(p,pose){
    const z=pose.center[2]+p[2]*pose.size[0],ratio=(1300-z)/(1300-pose.center[2]);
    return [(pose.center[0]+p[0]*pose.size[0])*ratio,80+(pose.center[1]+p[1]*pose.size[1]-80)*ratio,z];
  }
  function bounds(mesh,pose){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<mesh.data.length;i+=9){const p=worldPoint(mesh.data.subarray(i,i+3),pose);p.forEach((v,k)=>{min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);});}
    return {min,max};
  }
  return {definitions,build,placement,worldPoint,bounds};
});
