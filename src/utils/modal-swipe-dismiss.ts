/**
 * Wire swipe-down-to-dismiss on a mobile modal.
 * The drag zone is the swipe handle + modal header — these have touch-action: none
 * so the browser cannot intercept the gesture as a scroll.
 * Also pushes a history entry so Android back gesture closes the modal.
 *
 * @param modalId  The DOM id of the .modal element
 * @param closeFn  Function that closes/dismisses the modal
 */
export function wireModalSwipeDismiss(modalId: string, closeFn: () => void): void {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const content = modal.querySelector('.modal-content') as HTMLElement | null;
  if (!content) return;

  // Inject swipe handle pill at the top (CSS hides it on desktop)
  const handle = document.createElement('div');
  handle.className = 'modal-swipe-handle';
  content.insertBefore(handle, content.firstChild);

  // --- Swipe-down to dismiss ---
  // The drag zone is the handle + header. touch-action: none is set in CSS
  // so the browser doesn't hijack the touch as a scroll.
  const header = content.querySelector('.modal-header') as HTMLElement | null;
  const dragZones: HTMLElement[] = [handle];
  if (header) dragZones.push(header);

  let startY = 0;
  let currentY = 0;
  let tracking = false;

  for (const zone of dragZones) {
    zone.addEventListener('pointerdown', (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      startY = e.clientY;
      currentY = e.clientY;
      tracking = true;
      content.style.transition = 'none';
      // Capture pointer so we keep getting events even outside the zone
      try { zone.setPointerCapture(e.pointerId); } catch { /* ignored */ }
    });

    zone.addEventListener('pointermove', (e: PointerEvent) => {
      if (!tracking || !e.isPrimary) return;
      currentY = e.clientY;
      const dy = currentY - startY;

      if (dy < 0) {
        // Upward — cancel, not a dismiss gesture
        tracking = false;
        content.style.transform = '';
        content.style.opacity = '';
        content.style.transition = '';
        return;
      }

      if (dy > 5) {
        e.preventDefault();
        const progress = Math.min(dy / 300, 1);
        content.style.transform = `translateY(${dy}px)`;
        content.style.opacity = `${1 - progress * 0.5}`;
      }
    });

    zone.addEventListener('pointerup', (e: PointerEvent) => {
      if (!tracking || !e.isPrimary) return;
      tracking = false;
      const dy = currentY - startY;

      if (dy > 80) {
        // Dismiss with animation
        content.classList.add('dismissing');
        content.style.transform = '';
        content.style.opacity = '';
        content.style.transition = '';
        const onEnd = () => {
          content.classList.remove('dismissing');
          closeFn();
        };
        content.addEventListener('animationend', onEnd, { once: true });
        setTimeout(onEnd, 250);
      } else {
        // Snap back
        content.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
        content.style.transform = '';
        content.style.opacity = '';
      }
    });

    zone.addEventListener('pointercancel', () => {
      if (!tracking) return;
      tracking = false;
      content.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      content.style.transform = '';
      content.style.opacity = '';
    });
  }

  // --- Android back gesture (history-based) ---
  // When a modal opens, push a history entry. When the user presses back
  // (or swipes from screen edge on Android), popstate fires and we close the modal.
  const stateKey = `modal-${modalId}`;

  // Observe modal open/close via class changes
  const observer = new MutationObserver(() => {
    if (modal.classList.contains('active')) {
      // Modal just opened — push history entry
      if (!history.state?.[stateKey]) {
        history.pushState({ [stateKey]: true }, '');
      }
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });

  // Listen for back navigation
  window.addEventListener('popstate', (e) => {
    if (modal.classList.contains('active')) {
      // Modal is open and user pressed back — close it
      closeFn();
      // Don't let the popstate propagate further if this was our entry
      e.stopImmediatePropagation();
    }
  });
}
