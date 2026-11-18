(() => {
  const cards = document.querySelectorAll('.feedback-art');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function prepareFish(art) {
    const flight = art.querySelector('.fx-flight');
    if (!flight.children.length) {
      const coin = art.querySelector('.fx-trail img');
      for (let i = 0; i < 10; i++) {
        const copy = coin.cloneNode();
        copy.style.setProperty('--delay', (i / 30) + 's');
        flight.append(copy);
      }
    }
    const w = art.clientWidth;
    const h = art.clientHeight;
    const path = `M ${.82*w} ${.78*h} Q ${.91*w} ${.2*h} ${.17*w} ${.17*h}`;
    flight.style.setProperty('--fish-path', 'path("' + path + '")');
  }

  function replay(art) {
    if (reduceMotion.matches) return;
    if (art.classList.contains('fx-wallet')) prepareFish(art);
    art.classList.remove('demonstrating');
    // Start a fresh CSS animation even when the previous pass has just finished.
    void art.offsetWidth;
    art.classList.add('demonstrating');
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.intersectionRatio < .6) continue;
      observer.unobserve(entry.target);
      replay(entry.target);
    }
  }, { threshold:.6 }) : null;

  function updateMotion() {
    cards.forEach(art => {
      art.querySelector('.fx-replay').hidden = reduceMotion.matches;
      if (reduceMotion.matches) {
        observer?.unobserve(art);
        art.classList.remove('demonstrating');
      } else {
        observer?.observe(art);
      }
    });
  }
  cards.forEach(art => art.querySelector('.fx-replay').addEventListener('click', () => replay(art)));
  reduceMotion.addEventListener('change', updateMotion);
  updateMotion();
})();
