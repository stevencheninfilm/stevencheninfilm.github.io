/* Optional HD status UI. Media loading and replacement remain owned by ProgressiveVideo. */
(() => {
  document.querySelectorAll('[data-progressive-status]').forEach(status => {
    const group = status.closest('[data-progressive-group]');
    const owner = group || status.parentElement?.querySelector('video[data-src-hd]');
    const label = status.querySelector('[data-hd-label]');
    const progress = status.querySelector('[data-hd-progress]');
    const percentLabel = status.querySelector('[data-hd-percent]');
    const retry = status.querySelector('[data-hd-retry]');
    if (!owner || !label) return;

    const card = owner.closest?.('.deck-card');
    const panel = owner.closest?.('[data-workflow-item]');
    const deck = card?.closest('.project-deck');
    const interactionScope = card || panel;
    if (interactionScope) {
      const syncInteraction = () => {
        // aria-hidden alone does not remove a failed card's Retry from Tab order.
        // Keep the error visible for the return visit while disabling hidden UI.
        status.inert = Boolean(
          (card && (!card.classList.contains('is-active') || deck?.classList.contains('is-strip')))
          || owner.closest?.('[aria-hidden="true"], [hidden]')
        );
      };
      if (typeof MutationObserver === 'function') {
        const observer = new MutationObserver(syncInteraction);
        observer.observe(interactionScope, { attributes: true, attributeFilter: ['class', 'aria-hidden', 'hidden', 'inert'] });
        if (deck) observer.observe(deck, { attributes: true, attributeFilter: ['class'] });
      }
      syncInteraction();
    }

    const language = status.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || 'en';
    const chinese = /^zh(?:-|$)/i.test(language);
    const words = chinese
      ? { loading: '高清加载中', switching: '正在切换高清', restoring: '正在恢复预览', hd: '高清', error: '高清未加载', retry: '重试替换', retryLabel: '重试加载并切换至高清', progress: '高清视频加载进度' }
      : { loading: 'Loading HD', switching: 'Switching to HD', restoring: 'Restoring preview', hd: 'HD', error: 'HD unavailable', retry: 'Retry HD', retryLabel: 'Retry loading and switching to HD', progress: 'HD video loading progress' };
    const setText = (element, text) => { if (element && element.textContent !== text) element.textContent = text; };
    const setHidden = (element, hidden) => { if (element && element.hidden !== hidden) element.hidden = hidden; };
    let latest = { state: 'waiting', retryable: false };

    // Only state changes are announced. Streaming byte updates stay outside
    // this live region, so screen readers are not interrupted by every chunk.
    label.setAttribute('role', 'status');
    label.setAttribute('aria-live', 'polite');
    label.setAttribute('aria-atomic', 'true');
    percentLabel?.setAttribute('aria-hidden', 'true');
    // The badge sits above interactive comparison/carousel surfaces. Keep its
    // input local without canceling native focus, scrolling or button activation.
    for (const name of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click']) {
      status.addEventListener(name, event => event.stopPropagation());
    }
    if (progress) {
      progress.max = 100;
      progress.setAttribute('aria-live', 'off');
      if (!progress.getAttribute('aria-label')) progress.setAttribute('aria-label', words.progress);
    }
    if (retry) {
      setText(retry, words.retry);
      retry.setAttribute('aria-label', words.retryLabel);
      // Keep a mouse click on Retry from becoming a comparison-divider drag.
      // Do not prevent pointer default: the button must still receive focus.
      retry.addEventListener('pointerdown', event => event.stopPropagation());
    }

    const render = detail => {
      if (!detail || typeof detail.state !== 'string') return;
      latest = detail;
      const state = detail.state;
      status.dataset.hdState = state;
      const visible = ['loading', 'switching', 'restoring', 'hd', 'error'].includes(state);
      setHidden(status, !visible);
      setText(label, visible ? words[state] : '');
      const loading = state === 'loading';
      const percent = typeof detail.percent === 'number' && Number.isFinite(detail.percent)
        ? Math.max(0, Math.min(100, Math.floor(detail.percent))) : null;
      if (progress) {
        setHidden(progress, !loading);
        if (loading && percent !== null) progress.value = percent;
        else progress.removeAttribute('value');
      }
      setHidden(percentLabel, !loading || percent === null);
      setText(percentLabel, loading && percent !== null ? `${percent}%` : '');
      if (retry) {
        setHidden(retry, state !== 'error' || !detail.retryable);
        retry.disabled = false;
      }
    };
    owner.addEventListener('progressive-video:state', event => {
      // A nested or adjacent player must never update this player's badge.
      if (event.target !== owner) return;
      render(event.detail);
    });
    retry?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (latest.state !== 'error' || !latest.retryable || retry.disabled) return;
      retry.disabled = true;
      try {
        if (window.ProgressiveVideo?.retry(owner)) {
          render(window.ProgressiveVideo.getStatus?.(owner) || { state: 'waiting', retryable: false });
        } else retry.disabled = false;
      } catch (_) {
        // An unavailable retry cannot interrupt the currently attached preview.
        retry.disabled = false;
      }
    });

    render(window.ProgressiveVideo?.getStatus?.(owner) || latest);
  });
})();
