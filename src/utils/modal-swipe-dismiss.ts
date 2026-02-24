import { MODAL_SWIPE_DISMISS } from './interaction-constants';

/**
 * Wire swipe-down-to-dismiss on a mobile modal.
 *
 * Uses touch events directly (not pointer events) for two reasons:
 * 1. We can check scrollTop on touchstart and conditionally claim the
 *    gesture — allowing normal scroll when content is scrolled down,
 *    but intercepting for dismiss when at the top.
 * 2. Non-passive touchmove with preventDefault gives us reliable control
 *    over the compositor, avoiding pointercancel on the scrollable
 *    .modal-content container.
 *
 * Drag zone: the ENTIRE modal content when scrolled to top.
 * Header/handle always trigger dismiss regardless of scroll position.
 *
 * Also pushes a history entry so Android back gesture closes the modal.
 *
 * @param modalId  The DOM id of the .modal element
 * @param closeFn  Function that closes/dismisses the modal
 */
export function wireModalSwipeDismiss(modalId: string, closeFn: () => void, headerOnly?: boolean): (() => void) | undefined {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const content = modal.querySelector('.modal-content') as HTMLElement | null;
  if (!content) return;

  // Inject swipe handle pill at the top (CSS hides it on desktop)
  const handle = document.createElement('div');
  handle.className = 'modal-swipe-handle';
  content.insertBefore(handle, content.firstChild);

  const header = content.querySelector('.modal-header') as HTMLElement | null;

  let startY = 0;
  let currentY = 0;
  let tracking = false;
  let decided = false;   // have we decided dismiss vs scroll for this gesture?
  let dismissing = false; // did we commit to a dismiss gesture?

  function isInHeaderZone(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Node)) return false;
    if (handle.contains(target) || target === handle) return true;
    if (header && (header.contains(target) || target === header)) return true;
    return false;
  }

  content.addEventListener('touchstart', (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    tracking = true;
    decided = false;
    dismissing = false;
    content.style.transition = 'none';
  }, { passive: true });

  content.addEventListener('touchmove', (e: TouchEvent) => {
    if (!tracking) return;
    currentY = e.touches[0].clientY;
    const dy = currentY - startY;

    // First significant movement — decide dismiss or scroll
    if (!decided && Math.abs(dy) > 5) {
      decided = true;

      if (dy > 0) {
        // Pulling down — dismiss if:
        // (a) touch started in header/handle, OR
        // (b) content is scrolled to top
        const inHeader = isInHeaderZone(e.target);
        const atTop = content.scrollTop <= 0;
        dismissing = headerOnly ? inHeader : (inHeader || atTop);
      }
      // Pulling up or not eligible → let browser scroll normally
    }

    if (dismissing && dy > 0) {
      e.preventDefault();
      const progress = Math.min(dy / 300, 1);
      content.style.transform = `translateY(${dy}px)`;
      content.style.opacity = `${1 - progress * 0.5}`;
    }
  }, { passive: false });

  content.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;

    if (!dismissing) {
      resetContentStyle();
      return;
    }

    const dy = currentY - startY;

    if (dy > MODAL_SWIPE_DISMISS) {
      // Dismiss — transition from current position to off-screen
      content.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
      content.style.transform = 'translateY(100%)';
      content.style.opacity = '0';
      const onEnd = () => {
        content.style.transform = '';
        content.style.opacity = '';
        content.style.transition = '';
        closeFn();
      };
      content.addEventListener('transitionend', onEnd, { once: true });
      setTimeout(onEnd, 300); // safety fallback
    } else {
      // Snap back
      resetContentStyle();
    }

    dismissing = false;
  });

  content.addEventListener('touchcancel', () => {
    if (!tracking) return;
    tracking = false;
    dismissing = false;
    resetContentStyle();
  });

  function resetContentStyle(): void {
    content!.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    content!.style.transform = '';
    content!.style.opacity = '';
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

  const popstateHandler = (e: PopStateEvent) => {
    if (modal.classList.contains('active')) {
      closeFn();
      e.stopImmediatePropagation();
    }
  };
  window.addEventListener('popstate', popstateHandler);

  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', popstateHandler);
  };
}
