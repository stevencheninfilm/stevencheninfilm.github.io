/* Experimental 3D dolly. Scene points stay in world space; the camera moves.
   Separate from the approved 2D sampler/settings, which remain untouched. */
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./xuantian-flight.js'));
  else root.XuantianFlight3D = factory(root.XuantianFlight);
})(typeof window === 'undefined' ? globalThis : window, flight => {
  const duration = 7200;
  const clamp = n => Math.min(1, Math.max(0, n));
  const ease = n => flight.ease(n, [.48, 0, .52, 1]);
  const sample = elapsed => {
    const time = clamp(elapsed / duration), progress = ease(time);
    return {
      time, progress,
      // A small curved dolly, with no pointer following or camera shake.
      camera: [Math.sin(progress * Math.PI) * 32, progress * 54, 800 - progress * 1540],
      yaw: Math.sin(progress * Math.PI) * -.016,
      pitch: Math.sin(progress * Math.PI) * .006,
      mountainAlpha: 1 - ease((time - .8) / .2),
      exitAlpha: 1 - ease((time - .88) / .12)
    };
  };
  const depth = (sprite, index) => {
    const bases = {canopy:95, near:-80, middle:-650, far:-1300, wake:-1600,
      'mountain-near':-200, 'mountain-middle':-800, 'mountain-far':-1500};
    return (bases[sprite.layer] ?? -650) + (sprite.mountain ? 0 : ((index * 37) % 7 - 3) * 23);
  };
  const visibility = (sprite, distance, state) => {
    if (sprite.hidden || distance <= 30) return 0;
    if (sprite.mountain) return state.mountainAlpha * (sprite.alpha ?? 1);
    const near = ease((distance - 60) / 250);
    // Canopy leaves once; no new overhead sprites enter later in the shot.
    const canopy = sprite.layer === 'canopy' ? 1 - ease((state.time - .12) / .29) : 1;
    return near * canopy * state.exitAlpha * (sprite.alpha ?? 1);
  };
  return {sample, depth, visibility, ease, duration, startDelay:450, titleAt:800, endAt:duration+450};
});
