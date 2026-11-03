(() => {
  const deck = document.querySelector('.project-deck');
  const pagination = document.querySelector('.home-pagination');
  if (!deck || !pagination) return;

  const dock = document.querySelector('.thumbnail-dock');
  const deferredThumbnails = [...(dock?.querySelectorAll('img[data-src]') || [])];
  const revealThumbnail = image => {
    if (!image.dataset.src) return;
    image.src = image.dataset.src;
    image.removeAttribute('data-src');
  };
  if ('IntersectionObserver' in window && dock) {
    // The mobile dock scrolls horizontally: do not fetch thumbnails off its edge.
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        revealThumbnail(entry.target);
        observer.unobserve(entry.target);
      });
    }, { root: dock, rootMargin: '0px 24px', threshold: 0 });
    deferredThumbnails.forEach(image => observer.observe(image));
  } else deferredThumbnails.forEach(revealThumbnail);

  const stripSelectedCard = () => deck.querySelector('.deck-card.is-strip-selected');

  const prepareCardMedia = (card) => {
    if (!card || card.dataset.mediaLoaded === 'true') return;
    // The paired-video loader activates comparisons only in expanded view.
    if (card.classList?.contains('deck-card--comparison')) return;

    const video = card.querySelector('video[data-src]');
    if (video) {
      if (video.hasAttribute('data-workflow-video')) return;
      video.src = video.dataset.src;
      video.removeAttribute('data-src');
      video.load();
      card.dataset.mediaLoaded = 'true';
      return;
    }

    card.querySelectorAll('source[data-srcset]').forEach((source) => {
      source.srcset = source.dataset.srcset;
      source.removeAttribute('data-srcset');
    });

    card.querySelectorAll('img[data-src]').forEach((image) => {
      image.src = image.dataset.src;
      image.removeAttribute('data-src');
    });
    card.dataset.mediaLoaded = 'true';
  };

  deck.addEventListener('click', (event) => {
    if (!deck.classList.contains('is-strip')) return;
    prepareCardMedia(event.target.closest('.deck-card'));
  }, true);

  pagination.addEventListener('click', () => {
    if (!deck.classList.contains('is-strip')) return;
    prepareCardMedia(stripSelectedCard());
  }, true);

  window.addEventListener('keydown', (event) => {
    if (!deck.classList.contains('is-strip')) return;

    const cardTarget = event.target.closest?.('.deck-card');
    if (cardTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const selected = stripSelectedCard() || cardTarget;
      prepareCardMedia(selected);
      selected.click();
      return;
    }

    if (event.key === 'Enter' || event.key === 'Escape') {
      prepareCardMedia(stripSelectedCard());
      return;
    }

    const navigationKeys = ['ArrowRight', 'ArrowDown', 'PageDown', 'ArrowLeft', 'ArrowUp', 'PageUp'];
    if (!navigationKeys.includes(event.key)) return;
    event.preventDefault();
    const previous = stripSelectedCard();
    let frames = 0;
    const followSelection = () => {
      const selected = stripSelectedCard();
      if (selected && selected !== previous) {
        selected.focus({ preventScroll: true });
        return;
      }
      frames += 1;
      if (frames < 45) requestAnimationFrame(followSelection);
    };
    requestAnimationFrame(followSelection);
  }, true);
})();
