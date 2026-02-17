/**
 * Wire swipe-down-to-dismiss on a mobile modal.
 * The drag zone is the swipe handle + modal header.
 *
 * Key insight: .modal-content has overflow-y: auto, making it a scroll
 * container. The compositor claims vertical touches for scroll and fires
 * pointercancel before JavaScript can respond. To avoid this, we listen
 * on the header/handle directly (which have touch-action: none on
 * themselves and all children) and set pointer capture on those elements
 * — never on the scrollable content container.
 *
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

  const header = content.querySelector('.modal-header') as HTMLElement | null;

  // Collect all drag zone elements (handle + header)
  const dragZones: HTMLElement[] = [handle];
  if (header) dragZones.push(header);

  let startY = 0;
  let currentY = 0;
  let tracking = false;
  let captureEl: HTMLElement | null = null;
  let capturePointerId: number | null = null;

  function onPointerDown(e: PointerEvent): void {
    if (!e.isPrimary || e.button !== 0) return;
    startY = e.clientY;
    currentY = e.clientY;
    tracking = true;
    captureEl = e.currentTarget as HTMLElement;
    capturePointerId = e.pointerId;
    content!.style.transition = 'none';
    // Capture on the drag zone element (not the scrollable content)
    try { captureEl.setPointerCapture(e.pointerId); } catch { /* ignored */ }
  }

  function onPointerMove(e: PointerEvent): void {
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
      content!.style.transform = `translateY(${dy}px)`;
      content!.style.opacity = `${1 - progress * 0.5}`;
    }
  }

  function onPointerUp(e: PointerEvent): void {
    if (!tracking || !e.isPrimary) return;
    tracking = false;
    releaseCapture();
    const dy = currentY - startY;

    if (dy > 80) {
      // Dismiss with animation
      content!.classList.add('dismissing');
      content!.style.transform = '';
      content!.style.opacity = '';
      content!.style.transition = '';
      const onEnd = () => {
        content!.classList.remove('dismissing');
        closeFn();
      };
      content!.addEventListener('animationend', onEnd, { once: true });
      setTimeout(onEnd, 250);
    } else {
      resetContentStyle();
    }
  }

  function onPointerCancel(): void {
    if (!tracking) return;
    tracking = false;
    releaseCapture();
    resetContentStyle();
  }

  // Non-passive touchmove on each drag zone — prevents the browser from
  // interpreting the vertical touch as a scroll on the parent container.
  function onTouchMove(e: TouchEvent): void {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 5) {
      e.preventDefault();
    }
  }

  // Wire all drag zone elements
  for (const zone of dragZones) {
    zone.addEventListener('pointerdown', onPointerDown);
    zone.addEventListener('pointermove', onPointerMove);
    zone.addEventListener('pointerup', onPointerUp);
    zone.addEventListener('pointercancel', onPointerCancel);
    zone.addEventListener('touchmove', onTouchMove, { passive: false });
  }

  function resetContentStyle(): void {
    content!.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    content!.style.transform = '';
    content!.style.opacity = '';
  }

  function releaseCapture(): void {
    if (captureEl && capturePointerId !== null) {
      try { captureEl.releasePointerCapture(capturePointerId); } catch { /* ignored */ }
      captureEl = null;
      capturePointerId = null;
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
