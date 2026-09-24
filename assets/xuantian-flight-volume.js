/* WebGL2: reference-derived mountains + ray-marched volumetric clouds.
   Both mountain variants share the same cloud density, camera and timing. */
(()=>{
  const shared=`
    precision highp float;
    precision highp sampler3D;
    uniform sampler3D uNoise;
    uniform vec3 uCamera;
    uniform vec2 uView,uTurn;
    const vec3 SUN=vec3(-.600,.700,-.387);
    vec3 viewPoint(vec3 p){
      vec3 q=p-uCamera;
      q.xz=mat2(cos(uTurn.x),-sin(uTurn.x),sin(uTurn.x),cos(uTurn.x))*q.xz;
      q.yz=mat2(cos(uTurn.y),-sin(uTurn.y),sin(uTurn.y),cos(uTurn.y))*q.yz;
      return q;
    }
    vec4 clipPoint(vec3 q){float d=-q.z;return vec4(q.x*1.92*uView.y/uView.x,q.y*1.92+.14*d,1.004008*d-24.048096,d);}
    float noise3(vec3 p){return texture(uNoise,p).b;}
  `;
  const mountainVertex=`#version 300 es
    ${shared}
    layout(location=0) in vec3 aPosition;layout(location=1) in vec3 aNormal;
    layout(location=2) in vec2 aUv;layout(location=3) in float aBack;
    uniform vec3 uCenter;uniform vec2 uSize;
    out vec3 vNormal;out vec2 vUv;out float vBack;
    void main(){
      vec3 p=uCenter+aPosition*vec3(uSize,uSize.x);
      float ratio=(1300.-p.z)/(1300.-uCenter.z);
      p.xy=vec2(0.,80.)+(p.xy-vec2(0.,80.))*ratio;
      vNormal=normalize(aNormal/vec3(uSize,uSize.x));vUv=aUv;vBack=aBack;
      gl_Position=clipPoint(viewPoint(p));
    }
  `;
  const mountainFragment=`#version 300 es
    ${shared}
    uniform sampler2D uPhoto;uniform float uOpacity,uBrightness;
    in vec3 vNormal;in vec2 vUv;in float vBack;out vec4 color;
    void main(){
      vec4 photo=texture(uPhoto,vUv);if(photo.a<.015)discard;
      // Keep the complete original photographic face, including the pines,
      // limestone fissures and sun direction. Do not tile or replace it.
      float sideLight=mix(1.,.72+.17*max(0.,dot(normalize(vNormal),SUN)),vBack);
      color=vec4(pow(photo.rgb*uBrightness,vec3(2.2))*sideLight,photo.a*uOpacity);
    }
  `;
  const fullVertex=`#version 300 es
    precision highp float;out vec2 vUv;
    void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUv=p;gl_Position=vec4(p*2.-1.,0,1);}
  `;
  const volumeFragment=`#version 300 es
    ${shared}
    uniform sampler2D uRock,uDepth;
    uniform vec3 uCloudCenter[14],uCloudRadius[14];
    uniform int uSteps;
    in vec2 vUv;out vec4 color;
    float density(vec3 p){
      if(p.z>1450.||p.z< -2850.||p.y< -1900.||p.y>1400.)return 0.;
      float envelope=-1.;
      for(int i=0;i<14;i++)envelope=max(envelope,1.-length((p-uCloudCenter[i])/uCloudRadius[i]));
      if(envelope<=0.)return 0.;
      vec3 q=p*.0007;
      vec4 base=texture(uNoise,q);float billow=base.r*.68+texture(uNoise,q*2.07+.17).g*.27+noise3(q*4.13)*.05;
      float d=envelope-.28+(billow-.5)*1.45;
      if(d<=0.)return 0.;
      float erosion=(1.-texture(uNoise,q*5.9+.31).r)*.15;
      // The support boundary must reach zero continuously, even where noise
      // adds positive density. Otherwise an ellipsoid becomes a visible cut.
      return smoothstep(0.,.16,envelope)*clamp((d-erosion)*3.6,0.,1.);
    }
    float lightAt(vec3 p){
      float optical=0.;float stride=48.;
      for(int i=0;i<4;i++){p+=SUN*stride;optical+=density(p)*stride;stride*=1.75;}
      return exp(-optical*.007);
    }
    void integrateCloud(float a,float b,float jitter,vec3 ray,inout vec3 sum,inout float trans){
      float stepSize=max(0.,b-a);if(stepSize<.001||trans<.004)return;
      vec3 p=uCamera+ray*mix(a,b,.2+.6*jitter);float d=density(p);
      if(d<.0001)return;
      float sunlight=lightAt(p),forward=pow(max(0.,dot(ray,SUN)),5.);
      float silver=pow(sunlight,2.)*(.25+forward*.4);
      vec3 ambient=mix(vec3(.10,.135,.18),vec3(.19,.23,.28),smoothstep(-1000.,350.,p.y));
      vec3 illumination=ambient+vec3(.77,.64,.47)*(sunlight*.78+silver*.28);
      float alpha=1.-exp(-d*stepSize*.0105);
      sum+=trans*alpha*illumination;trans*=1.-alpha;
    }
    void main(){
      vec2 xy=(vUv*2.-1.);vec3 ray=normalize(vec3(xy.x*uView.x/uView.y/1.92,(xy.y-.14)/1.92,-1.));
      float rayZ=-ray.z;
      ray.yz=mat2(cos(uTurn.y),sin(uTurn.y),-sin(uTurn.y),cos(uTurn.y))*ray.yz;
      ray.xz=mat2(cos(uTurn.x),sin(uTurn.x),-sin(uTurn.x),cos(uTurn.x))*ray.xz;
      vec4 rock=texture(uRock,vUv);float depth=texture(uDepth,vUv).r;
      float hit=depth<.99999?144000./(6012.-(depth*2.-1.)*5988.)/rayZ:6500.;
      // Cover the WHOLE density support with a fixed sample budget. An
      // adaptive march that exhausts its loop can leave a planar cloud cut.
      vec3 invRay=1./mix(ray,vec3(.00001),lessThan(abs(ray),vec3(.00001)));
      vec3 a=(vec3(-2300.,-1900.,-2850.)-uCamera)*invRay;
      vec3 b=(vec3(2400.,1400.,1450.)-uCamera)*invRay;
      vec3 nearBox=min(a,b),farBox=max(a,b);
      float start=max(12.,max(nearBox.x,max(nearBox.y,nearBox.z)));
      float end=min(6500.,min(farBox.x,min(farBox.y,farBox.z)));
      float stride=max(0.,end-start)/float(uSteps);
      float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
      float trans=1.;vec3 sum=vec3(0);bool added=false;
      for(int i=0;i<112;i++){
        if(i>=uSteps||stride<=0.||trans<.004)break;
        float lo=start+float(i)*stride,hi=lo+stride;
        if(!added&&hit<=hi){
          integrateCloud(lo,max(lo,hit),jitter,ray,sum,trans);
          sum+=trans*rock.rgb*rock.a;trans*=1.-rock.a;added=true;
          // A partially faded mountain must NOT erase the clouds behind it.
          integrateCloud(max(lo,hit),hi,jitter,ray,sum,trans);
        }else integrateCloud(lo,hi,jitter,ray,sum,trans);
      }
      if(!added){sum+=trans*rock.rgb*rock.a;trans*=1.-rock.a;}
      float alpha=1.-trans;
      vec3 linear=alpha>.0001?sum/alpha:vec3(0);
      // Convert once, after physically compositing clouds in front of the rocks.
      vec3 srgb=pow(max(linear,vec3(0)),vec3(1./2.2));
      color=vec4(srgb*alpha,alpha);
    }
  `;
  function makeNoise(size=64){
    const out=new Uint8Array(size**3*4);
    const hash=(x,y,z)=>{let n=Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791);n=Math.imul(n^(n>>>13),1274126177);return (n>>>0)/4294967295;};
    const worley=(x,y,z,f)=>{
      const p=[x*f/size,y*f/size,z*f/size],cell=p.map(Math.floor);let nearest=3;
      for(let k=-1;k<=1;k++)for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){
        const a=cell[0]+i,b=cell[1]+j,c=cell[2]+k,wx=(a+f)%f,wy=(b+f)%f,wz=(c+f)%f;
        const dx=a+.15+.7*hash(wx,wy,wz)-p[0],dy=b+.15+.7*hash(wx+37,wy,wz)-p[1],dz=c+.15+.7*hash(wx,wy+59,wz)-p[2];
        nearest=Math.min(nearest,dx*dx+dy*dy+dz*dz);
      }
      return Math.max(0,1-Math.sqrt(nearest)*.8);
    };
    for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const o=((z*size+y)*size+x)*4;out[o]=worley(x,y,z,4)*255;out[o+1]=worley(x,y,z,8)*255;out[o+2]=hash(x,y,z)*255;out[o+3]=255;
    }
    return out;
  }
  window.XuantianVolumeRenderer=async(overlay,options={})=>{
    const scene=window.XuantianVolumeScene,reference=window.XuantianMountainReference;
    if(!scene||!reference||!overlay)throw Error('Volume scene unavailable');
    const canvas=document.createElement('canvas');canvas.className='xj-flight-canvas xj-flight-canvas--volume';
    canvas.setAttribute('aria-hidden','true');canvas.dataset.renderer='webgl2-volume';
    canvas.dataset.mountains=options.mountains==='cards'?'cards':'reference-relief';
    const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,powerPreference:'high-performance'});
    if(!gl)throw Error('WebGL2 is required for volumetric clouds');
    const timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),queries=[];
    let disposed=false,width=1,height=1,lastTime=0,rockTarget,rockProgram,volumeProgram,noise;
    const shaders=[],programs=[],buffers=[],textures=[],fbos=[],vaos=[],meshes=[];
    const onLost=e=>{e.preventDefault();options.onFailure?.();destroy();};
    const onResize=()=>{resize();draw(lastTime);};
    function destroy(){if(disposed)return;disposed=true;window.removeEventListener('resize',onResize);canvas.removeEventListener('webglcontextlost',onLost);canvas.remove();queries.forEach(q=>gl.deleteQuery(q));buffers.forEach(b=>gl.deleteBuffer(b));textures.forEach(t=>gl.deleteTexture(t));fbos.forEach(f=>gl.deleteFramebuffer(f));vaos.forEach(v=>gl.deleteVertexArray(v));shaders.forEach(s=>gl.deleteShader(s));programs.forEach(p=>gl.deleteProgram(p));gl.getExtension('WEBGL_lose_context')?.loseContext();canvas.width=canvas.height=1;}
    const program=(v,f)=>{
      const p=gl.createProgram();programs.push(p);
      for(const [type,source] of [[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}
      gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
    };
    const tex=()=>{const t=gl.createTexture();textures.push(t);return t;};
    const target=(w,h)=>{
      const f=gl.createFramebuffer();fbos.push(f);gl.bindFramebuffer(gl.FRAMEBUFFER,f);
      const color=tex(),depth=tex();
      gl.bindTexture(gl.TEXTURE_2D,color);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
      gl.bindTexture(gl.TEXTURE_2D,depth);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Volume framebuffer unavailable');
      return {f,color,depth,w,h};
    };
    const uniform=(p,n)=>gl.getUniformLocation(p,n);
    const bind=(p,name,t,slot,type=gl.TEXTURE_2D)=>{gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(type,t);gl.uniform1i(uniform(p,name),slot);};
    function resize(){
      const rect=overlay.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
      const budget=width<700?360000:1200000,scale=Math.min(1,Math.sqrt(budget/(width*height)));
      const w=Math.round(width*scale),h=Math.round(height*scale);canvas.width=w;canvas.height=h;
      if(rockTarget){gl.deleteFramebuffer(rockTarget.f);gl.deleteTexture(rockTarget.color);gl.deleteTexture(rockTarget.depth);fbos.splice(fbos.indexOf(rockTarget.f),1);textures.splice(textures.indexOf(rockTarget.color),1);textures.splice(textures.indexOf(rockTarget.depth),1);}
      rockTarget=target(w,h);canvas.dataset.renderSize=w+'×'+h;
      for(const mesh of meshes){mesh.pose=reference.placement(mesh.definition,width,height,mesh.aspect);mesh.bounds=reference.bounds(mesh.geometry,mesh.pose);}
    }
    function draw(elapsed){
      if(disposed)return;lastTime=elapsed;const s=scene.sample(elapsed),p=rockProgram;
      while(timer&&queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){
        const q=queries.shift();if(!gl.getParameter(timer.GPU_DISJOINT_EXT))canvas.dataset.gpuMs=(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6).toFixed(1);gl.deleteQuery(q);
      }
      const query=timer&&queries.length<3?gl.createQuery():null;if(query)gl.beginQuery(timer.TIME_ELAPSED_EXT,query);
      gl.bindFramebuffer(gl.FRAMEBUFFER,rockTarget.f);gl.viewport(0,0,canvas.width,canvas.height);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(p);gl.uniform3fv(uniform(p,'uCamera'),s.camera);gl.uniform2f(uniform(p,'uTurn'),s.yaw,s.pitch);gl.uniform2f(uniform(p,'uView'),width,height);
      let visible=0;
      for(const mesh of meshes){
        const alpha=scene.mountainAlpha(mesh.bounds,s,width,height);if(alpha<.001)continue;visible++;
        gl.uniform1f(uniform(p,'uOpacity'),alpha);gl.uniform1f(uniform(p,'uBrightness'),mesh.definition.brightness);
        gl.uniform3fv(uniform(p,'uCenter'),mesh.pose.center);gl.uniform2fv(uniform(p,'uSize'),mesh.pose.size);
        bind(p,'uPhoto',mesh.texture,3);gl.bindVertexArray(mesh.vao);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(volumeProgram);gl.bindVertexArray(null);
      gl.uniform3fv(uniform(volumeProgram,'uCamera'),s.camera);gl.uniform2f(uniform(volumeProgram,'uTurn'),s.yaw,s.pitch);gl.uniform2f(uniform(volumeProgram,'uView'),width,height);gl.uniform1f(uniform(volumeProgram,'uProgress'),s.progress);gl.uniform1i(uniform(volumeProgram,'uSteps'),width<700?88:112);
      bind(volumeProgram,'uNoise',noise,0,gl.TEXTURE_3D);bind(volumeProgram,'uRock',rockTarget.color,1);bind(volumeProgram,'uDepth',rockTarget.depth,2);
      gl.drawArrays(gl.TRIANGLES,0,3);canvas.dataset.visibleMountains=visible;canvas.dataset.cameraZ=s.camera[2].toFixed(1);canvas.dataset.time=elapsed.toFixed(1);
      if(query){gl.endQuery(timer.TIME_ELAPSED_EXT);queries.push(query);}
    }
    try{
      const hero=document.querySelector('.xj-hero__image');if(hero&&!hero.complete)await hero.decode();
      // Resolve via the renderer script so both the project page and review frame work.
      const script=[...document.scripts].find(s=>s.src.includes('/xuantian-flight-volume.js'));
      const images=await Promise.all(reference.definitions.map(async definition=>{
        const image=new Image();image.src=new URL('images/projects/xuantian-jie/mountain-'+definition.name+'.webp',script.src).href;
        await image.decode();return {definition,image};
      }));
      rockProgram=program(mountainVertex,mountainFragment);volumeProgram=program(fullVertex,volumeFragment);
      noise=tex();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_3D,noise);gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,64,64,64,0,gl.RGBA,gl.UNSIGNED_BYTE,makeNoise());
      gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);for(const wrap of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,wrap,gl.REPEAT);
      for(const {definition,image} of images){
        const texture=tex();gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        // Read only a small alpha/luminance grid for geometry. GPU material
        // remains the full-resolution original image, never this small grid.
        const readback=document.createElement('canvas');readback.width=177;readback.height=133;
        const ctx=readback.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,177,133);
        const pixels=ctx.getImageData(0,0,177,133).data;
        const mesh=reference.build(pixels,177,133,options.mountains!=='cards');readback.width=readback.height=1;
        const vao=gl.createVertexArray();vaos.push(vao);gl.bindVertexArray(vao);
        const b=gl.createBuffer(),e=gl.createBuffer();buffers.push(b,e);gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,mesh.data,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,e);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
        for(const [attribute,size,offset] of [[0,3,0],[1,3,12],[2,2,24],[3,1,32]]){gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,size,gl.FLOAT,false,36,offset);}
        meshes.push({vao,count:mesh.indices.length,geometry:mesh,texture,definition,aspect:image.naturalWidth/image.naturalHeight});
      }
      gl.useProgram(volumeProgram);gl.uniform3fv(uniform(volumeProgram,'uCloudCenter[0]'),scene.clouds.flatMap(c=>c.slice(0,3)));gl.uniform3fv(uniform(volumeProgram,'uCloudRadius[0]'),scene.clouds.flatMap(c=>c.slice(3)));
      resize();draw(0);if(gl.getError()!==gl.NO_ERROR)throw Error('Volume scene initialization failed');
      canvas.addEventListener('webglcontextlost',onLost);window.addEventListener('resize',onResize);overlay.append(canvas);
      return {canvas,draw,resize:onResize,destroy,backend:'webgl2-volume'};
    }catch(error){destroy();throw error;}
  };
})();
