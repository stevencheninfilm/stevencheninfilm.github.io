/* A bounded WebGL scene: curved photographic meshes, a real perspective
   camera and depth-sorted alpha. Not a full volumetric cloud simulation.
   No remote runtime dependencies; the original Canvas renderer is fallback. */
(() => {
  const vertex = `
    attribute vec2 aGrid;
    uniform vec3 uCenter, uCamera;
    uniform vec2 uSize, uView, uTurn;
    uniform vec3 uAngles;
    uniform float uBend, uFlip;
    varying vec2 vUv;
    varying float vDistance;
    void main() {
      vUv=vec2(mix(aGrid.x,1.0-aGrid.x,step(uFlip,0.0)),aGrid.y);
      vec2 p=(aGrid-.5)*uSize;
      float z=uBend*(1.0-4.0*dot(aGrid-.5,aGrid-.5));
      vec3 local=vec3(p.x*cos(uAngles.y)+z*sin(uAngles.y),p.y,-p.x*sin(uAngles.y)+z*cos(uAngles.y));
      local.yz=mat2(cos(uAngles.z),sin(uAngles.z),-sin(uAngles.z),cos(uAngles.z))*local.yz;
      local.xy=mat2(cos(uAngles.x),sin(uAngles.x),-sin(uAngles.x),cos(uAngles.x))*local.xy;
      vec3 q=uCenter+local-uCamera;
      q.xz=mat2(cos(uTurn.x),sin(uTurn.x),-sin(uTurn.x),cos(uTurn.x))*q.xz;
      q.yz=mat2(cos(uTurn.y),sin(uTurn.y),-sin(uTurn.y),cos(uTurn.y))*q.yz;
      float d=-q.z;
      vDistance=d;
      // Perspective projection, near=12 far=5000, principal point (53%,43%).
      gl_Position=vec4(q.x*1600.0/uView.x+.06*d,q.y*1600.0/uView.y+.14*d,
        (5012.0/4988.0)*d-120000.0/4988.0,d);
    }`;
  const fragment = `
    precision mediump float;
    uniform sampler2D uMap;
    uniform float uOpacity;
    varying vec2 vUv;
    varying float vDistance;
    void main() {
      vec4 photo=texture2D(uMap,vUv);
      // Suppress low-alpha matte contamination without sharpening the edge.
      float alpha=photo.a*smoothstep(0.0,.12,photo.a)*uOpacity;
      if(alpha<.001) discard;
      float haze=(1.0-exp(-max(vDistance-600.0,0.0)*.00012));
      vec3 rgb=mix(photo.rgb,vec3(.59,.65,.69),haze*.35);
      gl_FragColor=vec4(rgb,alpha);
    }`;
  const readScene = overlay => [...overlay.querySelectorAll('.xj-cloud, .xj-mountain')].map((el,index) => {
    const style=getComputedStyle(el), mountain=el.classList.contains('xj-mountain');
    const prefix=mountain?'--mountain-':'--cloud-';
    const number=(name,fallback=0)=>parseFloat(style.getPropertyValue(name))||fallback;
    return {id:'sprite-'+(index+1),layer:el.parentElement.dataset.flightLayer,mountain,
      url:style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1],
      x:number(prefix+'x'),y:number(prefix+'y'),size:number(prefix+'size'),
      angle:number('--turn')*Math.PI/180,flip:number('--flip',1),
      alpha:parseFloat(style.opacity),filter:style.filter};
  });
  window.XuantianFlight3DRenderer = async (overlay, options={}) => {
    if (location.protocol==='file:') throw Error('3D texture loading requires HTTP; use the local preview URL.');
    const motion=window.XuantianFlight3D;
    if (!overlay || !motion) throw Error('3D scene unavailable');
    const canvas=document.createElement('canvas');
    canvas.className='xj-flight-canvas xj-flight-canvas--3d';
    canvas.setAttribute('aria-hidden','true');canvas.dataset.renderer='webgl-3d';
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,powerPreference:'default'});
    if (!gl) throw Error('WebGL unavailable');
    let disposed=false,lastTime=0,width=1,height=1,program=null,buffer=null;
    const textures=new Map(),shaders=[],plates=[],images=new Map();
    const onLost=event=>{event.preventDefault();options.onFailure?.();destroy();};
    const onResize=()=>{resize();draw(lastTime);};
    function destroy() {
      if(disposed)return;disposed=true;
      window.removeEventListener('resize',onResize);
      canvas.removeEventListener('webglcontextlost',onLost);
      canvas.remove();textures.forEach(t=>gl.deleteTexture(t));textures.clear();
      shaders.forEach(s=>gl.deleteShader(s));if(program)gl.deleteProgram(program);if(buffer)gl.deleteBuffer(buffer);
      plates.forEach(p=>{p.width=p.height=1;});images.clear();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.width=canvas.height=1;
    }
    const load=async url=>{
      if(!url)throw Error('Missing 3D texture');
      const image=new Image();image.decoding='async';image.src=url;
      await image.decode();if(!image.naturalWidth)throw Error('Invalid 3D texture');
      images.set(url,image);
    };
    const sprites=(options.sprites || readScene(overlay)).filter(s=>!s.hidden);
    const hero=document.querySelector('.xj-hero__image');
    let uniforms,points;
    function resize() {
      const rect=overlay.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
      const budget=width<700?1400000:2800000;
      const dpr=Math.min(devicePixelRatio||1,1.75,Math.sqrt(budget/(width*height)));
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      gl.viewport(0,0,canvas.width,canvas.height);
      points=sprites.map((s,i)=>{
        const z=motion.depth(s,i),image=images.get(s.url);
        // Match the existing opening framing at t=0, then leave points fixed
        // in 3D. Only the camera and very small wind drift move afterward.
        const oldZ=window.XuantianFlight.layers[s.layer]?.start ?? -360;
        const oldProjection=800/(800-oldZ),distance=800-z;
        const portrait=width<=700&&height>width;
        const unit=Math.max(width/100,height*(s.mountain?(portrait?.0048:.0062):(portrait?.009:.0062)));
        const w=s.size*unit*oldProjection*distance/800;
        return {s,z,x:(width*s.x/100-width*.53)*oldProjection*distance/800,
          y:-(height*s.y/100-height*.43)*oldProjection*distance/800,
          w,h:w*image.naturalHeight/image.naturalWidth,index:i,
          cap:s.size*unit*1.2};
      }).sort((a,b)=>a.z-b.z);
    }
    function draw(elapsed) {
      if(disposed)return;lastTime=elapsed;
      const state=motion.sample(elapsed);
      gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);gl.uniform2f(uniforms.uView,width,height);
      gl.uniform3fv(uniforms.uCamera,state.camera);gl.uniform2f(uniforms.uTurn,state.yaw,state.pitch);
      let count=0;
      for(const p of points){
        const distance=state.camera[2]-p.z;
        const opacity=motion.visibility(p.s,distance,state);
        if(opacity<.001)continue;
        // The cloud-size ceiling is retained; nearby layers exit through
        // depth/occlusion instead of ballooning into a low-resolution wall.
        const scale=p.s.mountain?1:Math.min(1,p.cap*distance/(800*p.w));
        const wind=p.s.mountain?0:Math.sin(state.time*1.1+p.index)*state.progress*9;
        gl.uniform3f(uniforms.uCenter,p.x+wind,p.y,p.z);
        gl.uniform2f(uniforms.uSize,p.w*scale,p.h*scale);
        gl.uniform3f(uniforms.uAngles,-(p.s.angle||0),p.s.mountain?0:Math.sin(p.index*2.3)*.09,p.s.mountain?0:Math.cos(p.index)*.035);
        gl.uniform1f(uniforms.uBend,p.s.mountain?10:Math.min(56,p.w*.055)*scale);
        gl.uniform1f(uniforms.uFlip,p.s.flip||1);gl.uniform1f(uniforms.uOpacity,opacity);
        gl.bindTexture(gl.TEXTURE_2D,textures.get(p.s.url+'|'+p.s.filter));
        gl.drawArrays(gl.TRIANGLES,0,24*16*6);count++;
      }
      canvas.dataset.drawCalls=String(count);
      canvas.dataset.cameraZ=state.camera[2].toFixed(1);
    }
    try {
      await Promise.all([...new Set(sprites.map(s=>s.url).concat(hero?[hero.currentSrc||hero.src]:[]))].map(load));
      for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
        const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
      }
      program=gl.createProgram();shaders.forEach(s=>gl.attachShader(program,s));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      uniforms=Object.fromEntries(['uMap','uCenter','uCamera','uSize','uView','uTurn','uAngles','uBend','uFlip','uOpacity'].map(n=>[n,gl.getUniformLocation(program,n)]));
      const vertices=[];
      for(let y=0;y<16;y++)for(let x=0;x<24;x++)for(const [dx,dy] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]])vertices.push((x+dx)/24,(y+dy)/16);
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'aGrid');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.uniform1i(uniforms.uMap,0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      for(const s of sprites){
        const key=s.url+'|'+s.filter;if(textures.has(key))continue;
        const source=images.get(s.url),plate=document.createElement('canvas');plates.push(plate);
        plate.width=source.naturalWidth;plate.height=source.naturalHeight;
        const ctx=plate.getContext('2d');if(!ctx)throw Error('Texture grading unavailable');
        ctx.filter=s.filter||'none';ctx.drawImage(source,0,0);
        const texture=gl.createTexture();textures.set(key,texture);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,plate);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      }
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
      resize();draw(0);
      if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL texture initialization failed');
      canvas.addEventListener('webglcontextlost',onLost);window.addEventListener('resize',onResize);
      overlay.append(canvas);
      return {canvas,draw,resize:onResize,destroy,backend:'webgl-3d'};
    } catch(error) {destroy();throw error;}
  };
})();
