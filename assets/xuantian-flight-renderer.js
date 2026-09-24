/* Project the same scene into one bounded 2D surface. This avoids giant
   perspective/filter compositing layers being dropped during a refresh. */
(() => {
  const imageCache = new Map();
  const readNumber = (style, name, fallback=0) => parseFloat(style.getPropertyValue(name)) || fallback;
  const load = url => {
    if (!imageCache.has(url)) imageCache.set(url, (async () => {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      if (image.decode) await image.decode();
      else await new Promise((resolve,reject) => {image.onload=resolve;image.onerror=reject;});
      if (!image.naturalWidth) throw new Error('Missing opening texture');
      return image;
    })());
    return imageCache.get(url);
  };
  window.XuantianFlightRenderer = async (overlay, options={}) => {
    let flight = options.flight || window.XuantianFlight;
    if (!flight || !overlay) throw new Error('Opening scene unavailable');
    const canvas = document.createElement('canvas');
    canvas.className = 'xj-flight-canvas';
    canvas.setAttribute('aria-hidden','true');
    const context = canvas.getContext('2d', {alpha:true});
    if (!context) throw new Error('Canvas unavailable');
    const readScene = () => [...overlay.querySelectorAll('.xj-cloud, .xj-mountain')].map((element,index) => {
      const style = getComputedStyle(element);
      const mountain = element.classList.contains('xj-mountain');
      const prefix = mountain ? '--mountain-' : '--cloud-';
      const url = style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
      if (!url) throw new Error('Opening texture URL unavailable');
      return {
        id:'sprite-'+(index+1), name:mountain ? '山体 '+(index+1) : '云团 '+(index-3),
        layer:element.parentElement.dataset.flightLayer, mountain, url,
        x:readNumber(style,prefix+'x'), y:readNumber(style,prefix+'y'),
        size:readNumber(style,prefix+'size'), sway:readNumber(style,'--cloud-sway'),
        angle:readNumber(style,'--turn')*Math.PI/180, flip:readNumber(style,'--flip',1),
        filter:style.filter, alpha:parseFloat(style.opacity)
      };
    });
    let sprites = options.sprites || readScene();
    // Decode every unique source before painting, including the hero underneath.
    const hero = document.querySelector('.xj-hero__image');
    await Promise.all([...new Set(sprites.map(sprite=>sprite.url).concat(hero ? [hero.currentSrc || hero.src] : []))].map(load));
    const prepared = new Map();
    const prepare = async scene => {
      await Promise.all([...new Set(scene.map(sprite=>sprite.url))].map(load));
      for (const sprite of scene) {
      const key=sprite.url+'|'+sprite.filter;
      if (!prepared.has(key)) {
        const image=await imageCache.get(sprite.url);
        // Static grading/softness is rasterized once, never filtered per frame.
        const plate=document.createElement('canvas');
        plate.width=image.naturalWidth;plate.height=image.naturalHeight;
        const painter=plate.getContext('2d');
        if (!painter) throw new Error('Texture preparation unavailable');
        painter.filter=sprite.filter;
        painter.drawImage(image,0,0);
        prepared.set(key,plate);
      }
      sprite.plate=prepared.get(key);
      }
      return scene;
    };
    await prepare(sprites);
    let width=0,height=0,dpr=1,lastElapsed=0,destroyed=false;
    const resize = () => {
      const bounds=overlay.getBoundingClientRect();
      width=Math.max(1,bounds.width);height=Math.max(1,bounds.height);
      // Keep one stable, bounded backing surface even on large Retina displays.
      dpr=Math.min(window.devicePixelRatio || 1,2,Math.sqrt(4000000/(width*height)));
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    };
    const layout = elapsed => {
      const portrait=width<=700 && height>width;
      const originX=width*.53,originY=height*(portrait ? .4 : .43);
      const cloudUnit=Math.max(width/100,height*(portrait ? .009 : .0062));
      const mountainUnit=Math.max(width/100,height*(portrait ? .0048 : .0062));
      const states=Object.fromEntries(Object.keys(flight.layers).map(name=>[name,flight.sample(name,elapsed)]));
      return sprites.map(sprite => {
        const state=states[sprite.layer];
        if (!state || sprite.hidden) return null;
        const projection=800/(800-state.z);
        const x=originX+(width*(sprite.x/100+sprite.sway/100*state.progress)-originX)*projection;
        const y=originY+(height*(sprite.y/100+state.y/100)-originY)*projection;
        const box=sprite.size*(sprite.mountain ? mountainUnit : cloudUnit)*projection*(sprite.mountain ? 1 : state.scale);
        const ratio=sprite.plate.height/sprite.plate.width;
        const w=box,h=box*ratio;
        const radius=Math.hypot(w,h)/2;
        return {sprite,x,y,w,h,radius,projection,opacity:state.opacity*sprite.alpha};
      }).filter(Boolean);
    };
    const draw = elapsed => {
      if (destroyed) return;
      lastElapsed=elapsed;
      context.setTransform(dpr,0,0,dpr,0,0);
      context.clearRect(0,0,width,height);
      for (const {sprite,x,y,w,h,radius,opacity} of layout(elapsed)) {
        if (opacity<=.0001 || x+radius<0 || x-radius>width || y+radius<0 || y-radius>height) continue;
        context.save();
        context.globalAlpha=opacity;
        context.translate(x,y);context.rotate(sprite.angle);context.scale(sprite.flip,1);
        context.drawImage(sprite.plate,-w/2,-h/2,w,h);
        context.restore();
      }
    };
    const onResize=()=>{resize();draw(lastElapsed);};
    resize();draw(0);
    overlay.append(canvas);
    window.addEventListener('resize',onResize);
    return {draw, canvas, layout, resize:onResize,
      scene:()=>sprites.map(({plate,...sprite})=>({...sprite})),
      setFlight(value) {flight=value;},
      setSprites(scene) {
        const next=scene.map(sprite=>({...sprite,plate:prepared.get(sprite.url+'|'+sprite.filter)}));
        if (next.some(sprite=>!sprite.plate)) throw new Error('Prepare new textures before editing');
        sprites=next;
      },
      async prepareScene(scene) {await prepare(scene);},
      destroy() {
      destroyed=true;
      window.removeEventListener('resize',onResize);
      // Wait until the overlay exit has painted before dropping GPU resources.
      window.setTimeout(()=>{
        canvas.remove();canvas.width=canvas.height=1;
        prepared.forEach(plate=>{plate.width=plate.height=1;});prepared.clear();
        imageCache.clear();
      },300);
    }};
  };
})();
