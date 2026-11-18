(() => {
  'use strict';

  const board = document.getElementById('rhythm-board');
  if (!board || !('IntersectionObserver' in window)) return;

  const previews = board.querySelectorAll('.beat-loop');
  const inView = new Set();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function updatePreview(clip) {
    const inOpenPanel = board.open || clip.closest('.board-entry');
    if (!inView.has(clip) || !inOpenPanel || document.hidden ||
        reduceMotion.matches || navigator.connection?.saveData) {
      clip.pause();
      return;
    }
    if (!clip.hasAttribute('src')) clip.src = clip.dataset.src;
    clip.muted = true;
    // Browsers that disallow inline autoplay retain the original poster.
    clip.play().catch(() => {});
  }

  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const clip = entry.target;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.15) inView.add(clip);
      else inView.delete(clip);
      updatePreview(clip);
    }
  }, { threshold: 0.15 });

  previews.forEach(clip => observer.observe(clip));
  const updateAll = () => previews.forEach(updatePreview);
  board.addEventListener('toggle', updateAll);
  document.addEventListener('visibilitychange', updateAll);
  reduceMotion.addEventListener('change', updateAll);
  navigator.connection?.addEventListener('change', updateAll);
})();
