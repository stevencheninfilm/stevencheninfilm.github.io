(() => {
  const widget = document.querySelector('[data-xj-calendar]');
  if (!widget) return;
  const trigger = widget.querySelector('summary');
  const closeButton = widget.querySelector('.xj-calendar__close');
  const watch = widget.querySelector('.xj-calendar__watch');
  if (!trigger || !closeButton || !watch) return;
  const openers = [...document.querySelectorAll('[data-xj-calendar-open]')];
  let returnFocus = trigger;
  const syncExpanded = () => openers.forEach(button => button.setAttribute('aria-expanded', String(widget.open)));

  // Native disclosure, not a modal: no backdrop, scroll lock or focus trap.
  const close = (restoreFocus = false) => {
    if (!widget.open) return;
    widget.open = false;
    syncExpanded();
    if (restoreFocus) returnFocus.focus({ preventScroll: true });
  };
  openers.forEach(button => button.addEventListener('click', () => {
    returnFocus = button;
    widget.open = true;
    syncExpanded();
    closeButton.focus({ preventScroll: true });
  }));
  trigger.addEventListener('click', () => { returnFocus = trigger; });
  widget.addEventListener('toggle', syncExpanded);
  syncExpanded();
  closeButton.hidden = false;
  closeButton.addEventListener('click', () => close(true));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !widget.open) return;
    close(widget.contains(document.activeElement));
  });
  document.addEventListener('pointerdown', event => {
    if (!widget.contains(event.target) && !openers.some(button => button.contains(event.target))) close();
  });
  watch.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Keep the native #episode-1 link and existing episode-selection logic.
    close(true);
  });
})();
