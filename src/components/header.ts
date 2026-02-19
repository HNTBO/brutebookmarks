import { getCardSize, getPageWidth, updateCardSize, updatePageWidth } from '../features/preferences';
import { pushUndo, isUndoing } from '../features/undo';

export function initSizeController(): void {
  const controller = document.getElementById('size-controller')!;
  const handle = document.getElementById('size-handle')!;
  let isDragging = false;
  let pointerId: number | null = null;
  let dragStartCardSize: number | undefined;
  let dragStartPageWidth: number | undefined;

  function updateHandlePosition(): void {
    const rect = controller.getBoundingClientRect();
    const handleRadius = 8;
    // X = page width (left=narrow 50%, right=wide 100%)
    const xPercent = ((getPageWidth() - 50) / 50) * 100;
    // Y = card size (top=small 60, bottom=big 120)
    const yPercent = ((getCardSize() - 60) / 60) * 100;

    const xPos = handleRadius + (xPercent / 100) * (rect.width - handleRadius * 2);
    const yPos = handleRadius + (yPercent / 100) * (rect.height - handleRadius * 2);

    handle.style.left = `${xPos}px`;
    handle.style.top = `${yPos}px`;
  }

  function applyFromPointer(clientX: number, clientY: number): { pageWidth: number; cardSize: number } {
    const rect = controller.getBoundingClientRect();
    const handleRadius = 8;
    const innerWidth = rect.width - handleRadius * 2;
    const innerHeight = rect.height - handleRadius * 2;
    let xPercent = ((clientX - rect.left - handleRadius) / innerWidth) * 100;
    let yPercent = ((clientY - rect.top - handleRadius) / innerHeight) * 100;

    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));

    const newPageWidth = Math.round(50 + (xPercent / 100) * 50);
    const newCardSize = Math.round(60 + (yPercent / 100) * 60);

    updateCardSize(newCardSize);
    updatePageWidth(newPageWidth);
    updateHandlePosition();
    return { pageWidth: newPageWidth, cardSize: newCardSize };
  }

  // --- Pointer-based drag (handles mouse, touch, and pen) ---

  function onPointerMove(e: PointerEvent): void {
    if (!isDragging || !e.isPrimary) return;
    e.preventDefault();
    applyFromPointer(e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!isDragging || !e.isPrimary) return;
    finishDrag();
  }

  function onTouchMove(e: TouchEvent): void {
    if (isDragging) e.preventDefault();
  }

  function finishDrag(): void {
    if (isDragging && dragStartCardSize !== undefined && dragStartPageWidth !== undefined) {
      const endCS = getCardSize();
      const endPW = getPageWidth();
      if (endCS !== dragStartCardSize || endPW !== dragStartPageWidth) {
        const oldCS = dragStartCardSize;
        const oldPW = dragStartPageWidth;
        pushUndo({
          undo: () => { updateCardSize(oldCS); updatePageWidth(oldPW); updateHandlePosition(); },
          redo: () => { updateCardSize(endCS); updatePageWidth(endPW); updateHandlePosition(); },
        });
      }
    }
    isDragging = false;
    handle.classList.remove('dragging');
    dragStartCardSize = undefined;
    dragStartPageWidth = undefined;

    // Release pointer capture
    if (pointerId !== null) {
      try { handle.releasePointerCapture(pointerId); } catch { /* ignored */ }
      pointerId = null;
    }

    // Remove document-level listeners (only active during drag)
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('touchmove', onTouchMove);
  }

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return;
    e.preventDefault();

    isDragging = true;
    pointerId = e.pointerId;
    handle.classList.add('dragging');
    dragStartCardSize = getCardSize();
    dragStartPageWidth = getPageWidth();

    // Capture pointer for reliable tracking outside the handle
    try { handle.setPointerCapture(e.pointerId); } catch { /* ignored */ }

    // Document-level listeners — added per drag, removed on finish
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    // Non-passive touchmove prevents browser scroll during drag
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  });

  // Click on controller background (not the handle) — jump to position
  controller.addEventListener('click', (e) => {
    if (e.target === handle) return;
    const oldCS = getCardSize();
    const oldPW = getPageWidth();

    applyFromPointer(e.clientX, e.clientY);

    const newCS = getCardSize();
    const newPW = getPageWidth();
    if (!isUndoing() && (newCS !== oldCS || newPW !== oldPW)) {
      pushUndo({
        undo: () => { updateCardSize(oldCS); updatePageWidth(oldPW); updateHandlePosition(); },
        redo: () => { updateCardSize(newCS); updatePageWidth(newPW); updateHandlePosition(); },
      });
    }
  });

  setTimeout(updateHandlePosition, 0);

  // Expose for external callers (e.g. randomizeXY easter egg)
  (window as any).__refreshSizeHandle = updateHandlePosition;
}
