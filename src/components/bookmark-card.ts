import { dragController } from '../features/drag-drop';

export function handleCardMouseMove(e: MouseEvent): void {
  const card = e.currentTarget as HTMLElement;
  const rect = card.getBoundingClientRect();

  // Proximity radius scales with card size (matches CSS % button sizing)
  const proximityRadius = Math.max(25, rect.width * 0.35);

  const editBtn = card.querySelector<HTMLElement>('.edit-btn');
  const deleteBtn = card.querySelector<HTMLElement>('.delete-btn');

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

export function handleCardMouseLeave(e: MouseEvent): void {
  const card = e.currentTarget as HTMLElement;
  const editBtn = card.querySelector<HTMLElement>('.edit-btn');
  const deleteBtn = card.querySelector<HTMLElement>('.delete-btn');

  if (editBtn) editBtn.classList.remove('visible');
  if (deleteBtn) deleteBtn.classList.remove('visible');
}

export function openBookmark(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

// --- Long-press context menu (mobile) ---

let activeContextMenu: HTMLElement | null = null;
let longPressClickGuard = false;

function dismissContextMenu(): void {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
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
    startX = e.clientX;
    startY = e.clientY;
    activated = false;
    dragStarted = false;
    savedEvent = e;

    if (e.pointerType === 'mouse') {
      // Desktop: no long-press timer — drag starts on move
      timer = null;
    } else {
      // Touch: capture pointer immediately so the browser can't fire
      // pointercancel (claiming the touch for scroll) during the hold.
      // Released if the user scrolls (movement > 10px before timer fires).
      try { card.setPointerCapture(e.pointerId); } catch { /* ignored */ }

      // Touch: start 500ms timer for long-press activation
      timer = window.setTimeout(() => {
        timer = null;
        activated = true;
        card.classList.add('long-press-active');
        try { navigator.vibrate?.(50); } catch { /* ignored */ }
      }, 500);
    }
  });

  card.addEventListener('pointermove', (e: PointerEvent) => {
    if (!e.isPrimary) return;
    if (dragStarted) return; // already handed off to DragController

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (e.pointerType === 'mouse') {
      // Desktop: 5px move threshold → immediate drag
      if (dist > 5 && savedEvent && !dragController.active) {
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
      if (timer !== null && dist > 10) {
        clearTimeout(timer);
        timer = null;
        // Release capture so browser can resume scrolling
        try { card.releasePointerCapture(e.pointerId); } catch { /* ignored */ }
      }
      // Touch: if activated (long-press fired) and moved > 5px → start drag
      if (activated && dist > 5 && !dragController.active) {
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

    // Release capture if we still hold it (timer period ended without drag)
    try { card.releasePointerCapture(e.pointerId); } catch { /* ignored */ }

    if (dragStarted) return; // DragController handles pointerup

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
      if (Math.sqrt(dx * dx + dy * dy) <= 10) {
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
    if (e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;

    timer = window.setTimeout(() => {
      timer = null;
      try { navigator.vibrate?.(50); } catch { /* ignored */ }
      dismissContextMenu();
      showUndoRedoMenu(e.clientX, e.clientY);
    }, 500);
  });

  grid.addEventListener('pointermove', (e: PointerEvent) => {
    if (timer === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
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
    startX = e.clientX;
    tracking = true;
    menu.style.transition = 'none';
  });

  menu.addEventListener('pointermove', (e: PointerEvent) => {
    if (!tracking) return;
    const dx = e.clientX - startX;
    menu.style.transform = `translateX(${dx}px)`;
    menu.style.opacity = `${Math.max(0, 1 - Math.abs(dx) / 120)}`;
  });

  menu.addEventListener('pointerup', (e: PointerEvent) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 60) {
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

  menu.addEventListener('pointercancel', () => {
    if (!tracking) return;
    tracking = false;
    menu.style.transition = 'transform 0.15s ease-out, opacity 0.15s ease-out';
    menu.style.transform = 'translateX(0)';
    menu.style.opacity = '1';
  });
}

function showUndoRedoMenu(x: number, y: number): void {
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
      document.removeEventListener('pointerdown', dismissHandler, true);
      document.removeEventListener('scroll', scrollDismiss, true);
    }
  };
  const scrollDismiss = () => {
    dismissContextMenu();
    document.removeEventListener('pointerdown', dismissHandler, true);
    document.removeEventListener('scroll', scrollDismiss, true);
  };

  setTimeout(() => {
    document.addEventListener('pointerdown', dismissHandler, true);
    document.addEventListener('scroll', scrollDismiss, true);
  }, 0);
}

function showContextMenu(x: number, y: number, categoryId: string, bookmarkId: string): void {
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
      document.removeEventListener('pointerdown', dismissHandler, true);
      document.removeEventListener('scroll', scrollDismiss, true);
    }
  };
  const scrollDismiss = () => {
    dismissContextMenu();
    document.removeEventListener('pointerdown', dismissHandler, true);
    document.removeEventListener('scroll', scrollDismiss, true);
  };

  // Use setTimeout so the current pointerup doesn't immediately dismiss
  setTimeout(() => {
    document.addEventListener('pointerdown', dismissHandler, true);
    document.addEventListener('scroll', scrollDismiss, true);
  }, 0);
}
