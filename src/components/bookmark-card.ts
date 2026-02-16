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
  return false;
}

export function initLongPress(card: HTMLElement): void {
  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  let activated = false;

  card.addEventListener('pointerdown', (e: PointerEvent) => {
    // Only primary pointer (finger / left mouse)
    if (e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    activated = false;

    timer = window.setTimeout(() => {
      activated = true;
      card.classList.add('long-press-active');
      // Haptic feedback (Android; no-op on iOS / desktop)
      try { navigator.vibrate?.(50); } catch { /* ignored */ }
    }, 500);
  });

  card.addEventListener('pointermove', (e: PointerEvent) => {
    if (timer === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTimeout(timer);
      timer = null;
      if (activated) {
        card.classList.remove('long-press-active');
        activated = false;
      }
    }
  });

  card.addEventListener('pointerup', (e: PointerEvent) => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!activated) return;
    activated = false;
    card.classList.remove('long-press-active');

    // Prevent the click handler from opening the URL
    longPressClickGuard = true;
    // Clear guard after a tick in case click doesn't fire
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { longPressClickGuard = false; });
    });

    // Dismiss any existing menu first
    dismissContextMenu();

    // Show context menu
    const categoryId = card.dataset.categoryId!;
    const bookmarkId = card.dataset.bookmarkId!;
    showContextMenu(e.clientX, e.clientY, categoryId, bookmarkId);
  });

  card.addEventListener('pointercancel', () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (activated) {
      card.classList.remove('long-press-active');
      activated = false;
    }
  });

  // Prevent native context menu on long-press (mobile browsers)
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
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
