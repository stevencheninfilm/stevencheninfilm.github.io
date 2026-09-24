/* One camera clock for clouds and mountains. Pure sampling is also used by
   the development frame viewer, so screenshots exercise the real motion. */
((root, factory) => {
  const flight = factory();
  if (typeof module === 'object' && module.exports) module.exports = flight;
  else root.XuantianFlight = flight;
})(typeof window === 'undefined' ? globalThis : window, () => {
  const clamp = value => Math.max(0, Math.min(1, value));
  const curve = [.42, 0, .58, 1];
  const cubic = (t, a, b) => 3 * (1-t) * (1-t) * t * a + 3 * (1-t) * t * t * b + t*t*t;
  // Solve x before evaluating y: elapsed time is not the Bezier parameter.
  const ease = (time, points=curve) => {
    const x = clamp(time);
    if (x === 0 || x === 1) return x;
    let lo = 0, hi = 1;
    for (let i=0; i<20; i++) {
      const t = (lo+hi)/2;
      if (cubic(t, points[0], points[2]) < x) lo = t;
      else hi = t;
    }
    return cubic((lo+hi)/2, points[1], points[3]);
  };
  const layers = {
    far: {start:-880, end:690, drop:5, duration:5400, delay:120, fade:.72},
    middle: {start:-360, end:700, drop:12, duration:4700, delay:40, fade:.72},
    near: {start:-60, end:710, drop:22, duration:3400, delay:0, fade:.68},
    canopy: {start:-60, end:710, drop:-3, duration:2350, delay:0, fade:.72},
    wake: {start:-600, end:240, drop:2, duration:5450, delay:80, fade:.76},
    // Hold full opacity for 80% of each layer's elapsed movement time, then
    // ease out over the final 20%. This is time, not eased camera distance.
    'mountain-far': {start:-680, end:160, drop:8, duration:4600, delay:0, fadeStart:3680, fadeEnd:4600, alpha:1},
    'mountain-middle': {start:-420, end:300, drop:12, duration:4100, delay:0, fadeStart:3280, fadeEnd:4100, alpha:1},
    'mountain-near': {start:-120, end:480, drop:7, duration:3700, delay:0, fadeStart:2960, fadeEnd:3700, alpha:1}
  };
  const sampleLayer = (layer, elapsed, points=curve) => {
    const progress = ease((elapsed-layer.delay)/layer.duration, layer.curve || points);
    const z = layer.start + (layer.end-layer.start)*progress;
    // Mountain opacity gets its own elapsed-time Bezier, not a second easing
    // of camera progress (which compressed most of the fade into a few frames).
    const fade = layer.fadeStart === undefined
      ? ease((progress-layer.fade)/(1-layer.fade), layer.opacityCurve || points)
      : ease((elapsed-layer.fadeStart)/(layer.fadeEnd-layer.fadeStart), layer.opacityCurve || points);
    return {
      progress, z, y:layer.drop*progress,
      // Preserve the 120% apparent cloud-size ceiling even under eased motion.
      scale: Math.min(1, 1.2*(800-z)/800),
      opacity:(layer.alpha ?? 1)*(1-fade)
    };
  };
  const sample = (name, elapsed) => sampleLayer(layers[name], elapsed);
  const styles = state => ({
    '--flight-progress':state.progress.toFixed(6),
    '--flight-z':state.z.toFixed(3)+'px',
    '--flight-y':state.y.toFixed(3)+'vh',
    '--sprite-scale':state.scale.toFixed(6),
    '--flight-alpha':state.opacity.toFixed(6)
  });
  // Independent instances let the authoring panel use the production sampler
  // without mutating the live site's defaults.
  const create = setting => ({
    curve:setting.curve, layers:setting.layers,
    ...setting.timing, ease:time=>ease(time, setting.curve),
    sample:(name,time)=>sampleLayer(setting.layers[name],time,setting.curve)
  });
  return {curve, ease, layers, sample, styles, create, startDelay:300, titleAt:800, endAt:6200};
});
