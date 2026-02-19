import { DRAG_THRESHOLD } from './interaction-constants';

interface DragTrackingOptions {
  /** The element to track pointer events on. */
  element: HTMLElement;
  /** Distance in px before onThresholdExceeded fires (default: DRAG_THRESHOLD). */
  threshold?: number;
  /** Called once when the pointer moves past the threshold. */
  onThresholdExceeded: (e: PointerEvent) => void;
  /** Prevent native dragstart on the element (needed for handles with child images). */
  preventDragStart?: boolean;
}

/**
 * Attach pointer-based drag tracking to an element.
 *
 * Encapsulates the repeated pattern: pointerdown start, pointermove
 * threshold check, pointerup/pointercancel cleanup, setPointerCapture,
 * isPrimary filtering, and non-passive touchmove scroll prevention.
 */
export function attachDragTracking({
  element,
  threshold = DRAG_THRESHOLD,
  onThresholdExceeded,
  preventDragStart = false,
}: DragTrackingOptions): void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  element.style.touchAction = 'none';

  if (preventDragStart) {
    element.addEventListener('dragstart', (e) => e.preventDefault());
  }

  element.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
    try { element.setPointerCapture(e.pointerId); } catch { /* ignored */ }
  });

  element.addEventListener('pointermove', (e: PointerEvent) => {
    if (!tracking || !e.isPrimary) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > threshold) {
      tracking = false;
      onThresholdExceeded(e);
    }
  });

  element.addEventListener('pointerup', () => { tracking = false; });
  element.addEventListener('pointercancel', () => { tracking = false; });

  element.addEventListener('touchmove', (e: TouchEvent) => {
    if (tracking) e.preventDefault();
  }, { passive: false });
}
