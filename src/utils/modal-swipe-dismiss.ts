/**
 * Wire swipe-down-to-dismiss on a mobile modal.
 * The drag zone is the swipe handle + modal header.
 * Uses touchmove preventDefault (non-passive) to stop the browser from
 * hijacking the vertical touch — touch-action CSS alone doesn't propagate
 * to child elements (h2, close button).
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
  const header = content.querySelector('.modal-header') as HTMLElement | null;

  let startY = 0;
  let currentY = 0;
  let tracking = false;
  let pointerId: number | null = null;

  // We listen on the content element (captures bubbling from header children)
  // but only activate if the touch started inside a drag zone.
  function isInDragZone(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Node)) return false;
    if (handle.contains(target) || target === handle) return true;
    if (header && (header.contains(target) || target === header)) return true;
    return false;
  }

  content.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    if (!isInDragZone(e.target)) return;
    startY = e.clientY;
    currentY = e.clientY;
    tracking = true;
    pointerId = e.pointerId;
    content.style.transition = 'none';
    try { content.setPointerCapture(e.pointerId); } catch { /* ignored */ }
  });

  content.addEventListener('pointermove', (e: PointerEvent) => {
    if (!tracking || !e.isPrimary) return;
    currentY = e.clientY;
    const dy = currentY - startY;

    if (dy < 0) {
      // Upward — cancel, not a dismiss gesture
      tracking = false;
      resetContentStyle();
      releaseCapture();
      return;
    }

    if (dy > 5) {
      const progress = Math.min(dy / 300, 1);
      content.style.transform = `translateY(${dy}px)`;
      content.style.opacity = `${1 - progress * 0.5}`;
    }
  });

  // The key fix: a non-passive touchmove listener that calls preventDefault
  // when we're tracking a swipe. This prevents the browser from interpreting
  // the vertical touch as a scroll, which would fire pointercancel.
  content.addEventListener('touchmove', (e: TouchEvent) => {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 5) {
      e.preventDefault();
    }
  }, { passive: false });

  content.addEventListener('pointerup', (e: PointerEvent) => {
    if (!tracking || !e.isPrimary) return;
    tracking = false;
    releaseCapture();
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
      resetContentStyle();
    }
  });

  content.addEventListener('pointercancel', () => {
    if (!tracking) return;
    tracking = false;
    releaseCapture();
    resetContentStyle();
  });

  function resetContentStyle(): void {
    content!.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    content!.style.transform = '';
    content!.style.opacity = '';
  }

  function releaseCapture(): void {
    if (pointerId !== null) {
      try { content!.releasePointerCapture(pointerId); } catch { /* ignored */ }
      pointerId = null;
    }
  }

  // --- Android back gesture (history-based) ---
  const stateKey = `modal-${modalId}`;

  const observer = new MutationObserver(() => {
    if (modal.classList.contains('active')) {
      if (!history.state?.[stateKey]) {
        history.pushState({ [stateKey]: true }, '');
      }
    }
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });

  window.addEventListener('popstate', (e) => {
    if (modal.classList.contains('active')) {
      closeFn();
      e.stopImmediatePropagation();
    }
  });
}
