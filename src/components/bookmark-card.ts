import { dragController } from '../features/drag-drop';
import { LONG_PRESS_DELAY, GRID_LONG_PRESS_DELAY, DRAG_THRESHOLD, LONG_PRESS_CANCEL_DISTANCE, MENU_SWIPE_DISMISS } from '../utils/interaction-constants';

// Cache button element references per card to avoid repeated querySelector calls
const btnCache = new WeakMap<HTMLElement, { edit: HTMLElement | null; delete: HTMLElement | null }>();

function getCachedBtns(card: HTMLElement) {
  let cached = btnCache.get(card);
  if (!cached) {
    cached = {
      edit: card.querySelector<HTMLElement>('.edit-btn'),
      delete: card.querySelector<HTMLElement>('.delete-btn'),
    };
    btnCache.set(card, cached);
  }
  return cached;
}

export function handleCardPointerMove(e: PointerEvent): void {
  // Proximity hover only makes sense for mouse/pen — skip touch
  if (e.pointerType === 'touch') return;

  const card = e.currentTarget as HTMLElement;
  const rect = card.getBoundingClientRect();

  // Proximity radius scales with card size (matches CSS % button sizing)
  const proximityRadius = Math.max(25, rect.width * 0.35);

  const { edit: editBtn, delete: deleteBtn } = getCachedBtns(card);

  if (editBtn) {
    const br = editBtn.getBoundingClientRect();
    const dx = e.clientX - (br.left + br.width / 2);
    const dy = e.clientY - (br.top + br.height / 2);
    editBtn.classList.toggle('visible', Math.sqrt(dx * dx + dy * dy) <= proximityRadius);
  }

  if (deleteBtn) {
    const br = deleteBtn.getBoundingClientRect();
    const dx = e.clientX - (br.left + br.width / 2);
    const dy = e.clientY - (br.top + br.height / 2);
    deleteBtn.classList.toggle('visible', Math.sqrt(dx * dx + dy * dy) <= proximityRadius);
  }
}

export function handleCardPointerLeave(e: PointerEvent): void {
  if (e.pointerType === 'touch') return;

  const card = e.currentTarget as HTMLElement;
  const { edit: editBtn, delete: deleteBtn } = getCachedBtns(card);

  if (editBtn) editBtn.classList.remove('visible');
  if (deleteBtn) deleteBtn.classList.remove('visible');
}

export function openBookmark(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

// --- Long-press context menu (mobile) ---

let activeContextMenu: HTMLElement | null = null;
let longPressClickGuard = false;
let _cleanupDismissListeners: (() => void) | null = null;

function dismissContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
  if (_cleanupDismissListeners) {
    _cleanupDismissListeners();
    _cleanupDismissListeners = null;
  }
}

/** Returns true if a long-press just occurred and the click should be swallowed. */
export function consumeLongPressGuard(): boolean {
  if (longPressClickGuard) {
    longPressClickGuard = false;
    return true;
  }
  // Also check drag controller click guard (post-desktop-drag)
  if (dragController.consumeClickGuard()) {
    return true;
  }
  return false;
}

/**
 * Unified pointer handler for bookmark cards.
 * - Mobile (touch): 500ms long-press → if finger moves > 5px → drag mode; if lifts → context menu
 * - Desktop (mouse): pointerdown + 5px move → immediate drag (no 500ms wait)
 */
export function initLongPress(card: HTMLElement): void {
  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  let activated = false;     // long-press timer fired
  let dragStarted = false;   // drag has been initiated
  let savedEvent: PointerEvent | null = null;

  card.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (!e.isPrimary) return;
    // Don't capture pointer for edit/delete button clicks — let them bubble normally
    if ((e.target as HTMLElement).closest('[data-action]')) return;
    startX = e.clientX;
    startY = e.clientY;
    activated = false;
    dragStarted = false;
    savedEvent = e;

    // Capture pointer immediately for ALL pointer types so pointermove
    // events always reach this card (prevents events going to adjacent
    // cards, grid gaps, or child elements during the pre-drag phase).
    try { card.setPointerCapture(e.pointerId); } catch { /* ignored */ }

    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      // Mouse/pen: no long-press timer — drag starts on move
      timer = null;
    } else {
      // Touch: start long-press timer
      timer = window.setTimeout(() => {
        timer = null;
        activated = true;
        card.classList.add('long-press-active');
        try { navigator.vibrate?.(50); } catch { /* ignored */ }
      }, LONG_PRESS_DELAY);
    }
  });

  card.addEventListener('pointermove', (e: PointerEvent) => {
    if (!e.isPrimary) return;
    if (dragStarted) return; // already handed off to DragController

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      // Mouse/pen: move threshold → immediate drag
      if (dist > DRAG_THRESHOLD && savedEvent && !dragController.active) {
        dragStarted = true;
        card.classList.remove('long-press-active');
        dragController.startDrag(e, {
          kind: 'bookmark',
          categoryId: card.dataset.categoryId!,
          bookmarkId: card.dataset.bookmarkId!,
          index: parseInt(card.dataset.index!),
        }, card);
      }
    } else {
      // Touch: if timer still running and moved too far, cancel long-press
      if (timer !== null && dist > LONG_PRESS_CANCEL_DISTANCE) {
        clearTimeout(timer);
        timer = null;
        // Release capture so browser can resume scrolling
        try { card.releasePointerCapture(e.pointerId); } catch { /* ignored */ }
      }
      // Touch: if activated (long-press fired) and moved past threshold → start drag
      if (activated && dist > DRAG_THRESHOLD && !dragController.active) {
        dragStarted = true;
        activated = false;
        card.classList.remove('long-press-active');
        dragController.startDrag(e, {
          kind: 'bookmark',
          categoryId: card.dataset.categoryId!,
          bookmarkId: card.dataset.bookmarkId!,
          index: parseInt(card.dataset.index!),
        }, card);
      }
    }
  });

  card.addEventListener('pointerup', (e: PointerEvent) => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    savedEvent = null;

    if (dragStarted) return; // DragController owns capture and handles pointerup

    // No drag started — release our pre-drag pointer capture
    try { card.releasePointerCapture(e.pointerId); } catch { /* ignored */ }

    if (!activated) return;
    activated = false;
    card.classList.remove('long-press-active');

    // Long-press + lift = context menu (mobile)
    longPressClickGuard = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { longPressClickGuard = false; });
    });

    dismissContextMenu();

    const categoryId = card.dataset.categoryId!;
    const bookmarkId = card.dataset.bookmarkId!;
    showContextMenu(e.clientX, e.clientY, categoryId, bookmarkId);
  });

  card.addEventListener('pointercancel', () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    savedEvent = null;
    if (activated) {
      card.classList.remove('long-press-active');
      activated = false;
    }
  });

  // Prevent browser from claiming the touch for scroll (which fires pointercancel).
  // Three phases: (1) during 500ms timer — prevent scroll while finger is still
  // (< 10px), allowing normal swipe-to-scroll if moved further; (2) after activation —
  // always prevent; (3) during drag — always prevent.
  card.addEventListener('touchmove', (e: TouchEvent) => {
    if (activated || dragStarted) {
      e.preventDefault();
      return;
    }
    if (timer !== null) {
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.sqrt(dx * dx + dy * dy) <= LONG_PRESS_CANCEL_DISTANCE) {
        e.preventDefault();
      }
    }
  }, { passive: false });

  // Prevent native context menu on long-press (mobile browsers)
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}

export function initGridLongPress(grid: HTMLElement): void {
  let timer: number | null = null;
  let startX = 0;
  let startY = 0;

  grid.addEventListener('pointerdown', (e: PointerEvent) => {
    // Only fire on grid background (gaps / empty area), not on cards
    if ((e.target as HTMLElement).closest('.bookmark-card')) return;
    if (e.button !== 0 || !e.isPrimary) return;
    startX = e.clientX;
    startY = e.clientY;

    const delay = e.pointerType === 'touch' ? GRID_LONG_PRESS_DELAY : LONG_PRESS_DELAY;
    timer = window.setTimeout(() => {
      timer = null;
      try { navigator.vibrate?.(50); } catch { /* ignored */ }
      dismissContextMenu();
      showUndoRedoMenu(e.clientX, e.clientY);
    }, delay);
  });

  grid.addEventListener('pointermove', (e: PointerEvent) => {
    if (!e.isPrimary || timer === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_CANCEL_DISTANCE) {
      clearTimeout(timer);
      timer = null;
    }
  });

  grid.addEventListener('pointerup', () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  });
  grid.addEventListener('pointercancel', () => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
  });

  grid.addEventListener('contextmenu', (e) => {
    if (!(e.target as HTMLElement).closest('.bookmark-card')) {
      e.preventDefault();
    }
  });
}

function wireSwipeToDismiss(menu: HTMLElement): void {
  let startX = 0;
  let tracking = false;

  menu.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!e.isPrimary) return;
    startX = e.clientX;
    tracking = true;
    menu.style.transition = 'none';
  });

  menu.addEventListener('pointermove', (e: PointerEvent) => {
    if (!e.isPrimary || !tracking) return;
    const dx = e.clientX - startX;
    menu.style.transform = `translateX(${dx}px)`;
    menu.style.opacity = `${Math.max(0, 1 - Math.abs(dx) / 120)}`;
  });

  menu.addEventListener('pointerup', (e: PointerEvent) => {
    if (!e.isPrimary || !tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > MENU_SWIPE_DISMISS) {
      // Swipe past threshold — slide out and dismiss
      const direction = dx > 0 ? 200 : -200;
      menu.style.transition = 'transform 0.15s ease-out, opacity 0.15s ease-out';
      menu.style.transform = `translateX(${direction}px)`;
      menu.style.opacity = '0';
      menu.addEventListener('transitionend', () => dismissContextMenu(), { once: true });
    } else {
      // Snap back
      menu.style.transition = 'transform 0.15s ease-out, opacity 0.15s ease-out';
      menu.style.transform = 'translateX(0)';
      menu.style.opacity = '1';
    }
  });

  menu.addEventListener('pointercancel', (e: PointerEvent) => {
    if (!e.isPrimary || !tracking) return;
    tracking = false;
    menu.style.transition = 'transform 0.15s ease-out, opacity 0.15s ease-out';
    menu.style.transform = 'translateX(0)';
    menu.style.opacity = '1';
  });
}

function showUndoRedoMenu(x: number, y: number): void {
  dismissContextMenu(); // Ensure previous menu listeners are cleaned up
  const menu = document.createElement('div');
  menu.className = 'long-press-menu';

  menu.innerHTML = `
    <button class="long-press-menu-btn" data-action="undo">↩ Undo</button>
    <button class="long-press-menu-btn" data-action="redo">↪ Redo</button>
  `;

  document.body.appendChild(menu);
  const menuRect = menu.getBoundingClientRect();
  let left = x - menuRect.width / 2;
  let top = y - menuRect.height - 8;

  if (top < 8) top = y + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  activeContextMenu = menu;
  wireSwipeToDismiss(menu);

  menu.querySelector('[data-action="undo"]')!.addEventListener('click', async () => {
    dismissContextMenu();
    const { undo } = await import('../features/undo');
    await undo();
  });

  menu.querySelector('[data-action="redo"]')!.addEventListener('click', async () => {
    dismissContextMenu();
    const { redo } = await import('../features/undo');
    await redo();
  });

  const dismissHandler = (e: Event) => {
    if (!menu.contains(e.target as Node)) {
      dismissContextMenu();
    }
  };
  const scrollDismiss = () => {
    dismissContextMenu();
  };

  _cleanupDismissListeners = () => {
    document.removeEventListener('pointerdown', dismissHandler, true);
    document.removeEventListener('scroll', scrollDismiss, true);
  };

  setTimeout(() => {
    document.addEventListener('pointerdown', dismissHandler, true);
    document.addEventListener('scroll', scrollDismiss, true);
  }, 0);
}

function showContextMenu(x: number, y: number, categoryId: string, bookmarkId: string): void {
  dismissContextMenu(); // Ensure previous menu listeners are cleaned up
  const menu = document.createElement('div');
  menu.className = 'long-press-menu';

  menu.innerHTML = `
    <button class="long-press-menu-btn" data-action="edit">✎ Edit</button>
    <button class="long-press-menu-btn long-press-menu-btn-danger" data-action="delete">× Delete</button>
  `;

  // Position: ensure menu stays within viewport
  document.body.appendChild(menu);
  const menuRect = menu.getBoundingClientRect();
  let left = x - menuRect.width / 2;
  let top = y - menuRect.height - 8;

  // If menu would go above viewport, show below touch point
  if (top < 8) top = y + 8;
  // Clamp horizontal
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  activeContextMenu = menu;
  wireSwipeToDismiss(menu);

  // Wire edit
  menu.querySelector('[data-action="edit"]')!.addEventListener('click', async () => {
    dismissContextMenu();
    const { openEditBookmarkModal } = await import('./modals/bookmark-modal');
    openEditBookmarkModal(categoryId, bookmarkId);
  });

  // Wire delete
  menu.querySelector('[data-action="delete"]')!.addEventListener('click', async () => {
    dismissContextMenu();
    const { deleteBookmark } = await import('./modals/bookmark-modal');
    deleteBookmark(categoryId, bookmarkId);
  });

  // Dismiss on tap outside or scroll
  const dismissHandler = (e: Event) => {
    if (!menu.contains(e.target as Node)) {
      dismissContextMenu();
    }
  };
  const scrollDismiss = () => {
    dismissContextMenu();
  };

  _cleanupDismissListeners = () => {
    document.removeEventListener('pointerdown', dismissHandler, true);
    document.removeEventListener('scroll', scrollDismiss, true);
  };

  // Use setTimeout so the current pointerup doesn't immediately dismiss
  setTimeout(() => {
    document.addEventListener('pointerdown', dismissHandler, true);
    document.addEventListener('scroll', scrollDismiss, true);
  }, 0);
}
