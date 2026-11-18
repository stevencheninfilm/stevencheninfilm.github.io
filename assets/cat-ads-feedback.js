(() => {
  const cards = Array.from(document.querySelectorAll('.feedback-art'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const visibleCards = new Set();
  const stepDelay = 1150;
  const loopDelay = 1800;
  let lastCard = null;
  let timer = null;

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

  function playStep(art) {
    clearTimeout(timer);
    replay(art);
    lastCard = art;
    const moreSteps = cards.slice(cards.indexOf(art) + 1).some(card => visibleCards.has(card));
    timer = setTimeout(() => {
      timer = null;
      updatePlayback();
    }, moreSteps ? stepDelay : loopDelay);
  }

  function updatePlayback() {
    if (document.hidden || reduceMotion.matches || !visibleCards.size) {
      clearTimeout(timer);
      timer = null;
      lastCard = null;
      cards.forEach(card => card.classList.remove('demonstrating'));
      return;
    }
    if (timer !== null) return;
    const next = cards.slice(cards.indexOf(lastCard) + 1).find(card => visibleCards.has(card));
    playStep(next || cards.find(card => visibleCards.has(card)));
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const { target, intersectionRatio } of entries) {
        if (intersectionRatio >= .5) {
          visibleCards.add(target);
        } else {
          visibleCards.delete(target);
          target.classList.remove('demonstrating');
        }
      }
      updatePlayback();
    }, { threshold: .5 });
    cards.forEach(card => observer.observe(card));
  }

  function updateMotionPreference() {
    cards.forEach(card => { card.querySelector('.fx-replay').hidden = reduceMotion.matches; });
    updatePlayback();
  }
  cards.forEach(card => card.querySelector('.fx-replay').addEventListener('click', () => playStep(card)));
  document.addEventListener('visibilitychange', updatePlayback);
  reduceMotion.addEventListener('change', updateMotionPreference);
  updateMotionPreference();
})();
