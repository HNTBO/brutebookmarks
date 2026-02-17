/**
 * Wire swipe-down-to-dismiss on a mobile modal.
 * The modal element must have class "modal" and contain a ".modal-content" child.
 * A ".modal-swipe-handle" pill is injected at the top of .modal-content for affordance.
 *
 * @param modalId  The DOM id of the .modal element
 * @param closeFn  Function that closes/dismisses the modal
 */
export function wireModalSwipeDismiss(modalId: string, closeFn: () => void): void {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const content = modal.querySelector('.modal-content') as HTMLElement | null;
  if (!content) return;

  // Inject swipe handle pill (CSS hides it on desktop)
  const handle = document.createElement('div');
  handle.className = 'modal-swipe-handle';
  content.insertBefore(handle, content.firstChild);

  let startY = 0;
  let currentY = 0;
  let tracking = false;

  content.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0) return;
    // Only start tracking if at the top of scroll (can't swipe-dismiss while scrolled)
    if (content.scrollTop > 5) return;
    startY = e.clientY;
    currentY = e.clientY;
    tracking = true;
    content.style.transition = 'none';
  });

  content.addEventListener('pointermove', (e: PointerEvent) => {
    if (!tracking || !e.isPrimary) return;
    currentY = e.clientY;
    const dy = currentY - startY;

    // Only track downward swipes, and only if we started near the top
    if (dy < 0) {
      // Upward — cancel tracking, allow normal scroll
      tracking = false;
      content.style.transform = '';
      content.style.opacity = '';
      content.style.transition = '';
      return;
    }

    if (dy > 10) {
      // Prevent scroll while swiping down
      e.preventDefault();
      const progress = Math.min(dy / 300, 1);
      content.style.transform = `translateY(${dy}px)`;
      content.style.opacity = `${1 - progress * 0.5}`;
    }
  });

  content.addEventListener('pointerup', (e: PointerEvent) => {
    if (!tracking || !e.isPrimary) return;
    tracking = false;
    const dy = currentY - startY;

    if (dy > 80) {
      // Dismiss
      content.classList.add('dismissing');
      content.style.transform = '';
      content.style.opacity = '';
      content.style.transition = '';
      const onEnd = () => {
        content.classList.remove('dismissing');
        closeFn();
      };
      content.addEventListener('animationend', onEnd, { once: true });
      // Fallback if animation doesn't fire
      setTimeout(onEnd, 250);
    } else {
      // Snap back
      content.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
      content.style.transform = '';
      content.style.opacity = '';
    }
  });

  content.addEventListener('pointercancel', () => {
    if (!tracking) return;
    tracking = false;
    content.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    content.style.transform = '';
    content.style.opacity = '';
  });
}
