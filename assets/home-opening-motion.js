(function (root, factory) {
  const motion = factory();
  if (typeof module === 'object' && module.exports) module.exports = motion;
  else root.StevenHomeOpening = motion;
})(typeof window === 'undefined' ? globalThis : window, () => {
  const timing = { wallStart: 1500, zoomStart: 3050, zoomEnd: 4650, reveal: 4510, end: 4850 };
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const p = clamp(value);
    return p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
  };
  const mix = (a, b, p) => a + (b - a) * p;
  function geometry(width, height, target) {
    const narrow = width <= 600;
    const tileWidth = width * (narrow ? .44 : .235);
    const tileHeight = height * (narrow ? .22 : .235);
    return { width, height, tileWidth, tileHeight,
      stepX: tileWidth + width * (narrow ? .025 : .018),
      stepY: tileHeight + height * .05,
      target: target || { left: 0, top: 0, width, height } };
  }
  function sample(time, layout, column, row, lead = false) {
    const { width, height, tileWidth, tileHeight, stepX, stepY, target } = layout;
    const rowIndex = row + 2;
    const start = 1000 + rowIndex * 190 + Math.abs(column) * 90;
    const arrival = ease((time - start) / (1400 + rowIndex * 55));
    const rise = (1 - arrival) * height * 2;
    const zoomProgress = clamp((time - timing.zoomStart) / (timing.zoomEnd - timing.zoomStart));
    const zoomEase = (1 - Math.cos(Math.PI * zoomProgress)) / 2;
    const zoom = mix(1, Math.max(width / tileWidth, height / tileHeight), zoomEase);
    const centerX = width / 2, centerY = height / 2;
    if (lead) {
      const w = mix(tileWidth, target.width, zoomEase), h = mix(tileHeight, target.height, zoomEase);
      return {
        x: mix(centerX, target.left + target.width / 2, zoomEase) - w / 2,
        y: mix(centerY, target.top + target.height / 2, zoomEase) + rise * (1 - zoomEase) - h / 2,
        width: w, height: h, scale: 1, opacity: time < start ? 0 : 1
      };
    }
    const stagger = Math.abs(column) * .012 * height;
    return {
      x: centerX + (column * stepX - tileWidth / 2) * zoom,
      y: centerY + (row * stepY + stagger + rise - tileHeight / 2) * zoom,
      width: tileWidth, height: tileHeight, scale: zoom, opacity: time < start ? 0 : 1
    };
  }
  return { timing, geometry, sample };
});
