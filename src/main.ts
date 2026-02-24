import './styles/main.css';
import { renderApp } from './app';
import { initializeData, setRenderCallback, setPreferencesCallback, setPreferencesCollector, activateConvex, getSnapshotCacheMeta, hasConvexHydrated, setSyncWatermark } from './data/store';
import { renderCategories, renderStartupShell } from './components/categories';
import { consumeLongPressGuard } from './components/bookmark-card';
import { dragController } from './features/drag-drop';
import { initSizeController } from './components/header';
import { initBookmarkModal, openAddBookmarkModal, openEditBookmarkModal, deleteBookmark } from './components/modals/bookmark-modal';
import { initCategoryModal, openAddCategoryModal, openEditCategoryModal } from './components/modals/category-modal';
import { initSettingsModal, openSettingsModal } from './components/modals/settings-modal';
import { dismissTopModal } from './utils/modal-manager';
import { initConfirmModal } from './components/modals/confirm-modal';
import { initUploadArea, useFavicon, toggleIconSearch, searchIcons, toggleEmojiSearch, searchEmojis, setActiveIconButton } from './components/icon-picker';
import { toggleTheme, syncThemeUI, applyTheme, randomizeAccentHue } from './features/theme';
import { undo, redo, setAfterUndoRedoCallback, runInUndoGroup } from './features/undo';
import { updateCardSize, updatePageWidth, syncPreferencesUI, getCardSize, getPageWidth, applyPreferences, collectPreferences, flushSyncToConvex, cycleBarscale, toggleWireframe, randomizeBarscale, randomizeWireframe, randomizeXY, getWireframe, initBarscaleAndWireframe, getEasterEggs } from './features/preferences';
import { initClerk, getAuthToken, initExtensionBridge, triggerSignIn } from './auth/clerk';
import { initConvexClient, setConvexAuth, getConvexClient } from './data/convex-client';
import { getAppMode, setAppMode } from './data/local-storage';
import { showWelcomeGate, hideWelcomeGate } from './components/welcome-gate';
import { seedLocalDefaults } from './data/store';
import { initExtensionDetection } from './utils/extension-bridge';
import { api } from '../convex/_generated/api';
import { shouldRenderSnapshotCache } from './utils/snapshot-watermark';

// Generate noise texture once (replaces SVG feTurbulence — cheaper to render)
{
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(128, 128);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--noise-texture', `url(${c.toDataURL('image/png')})`);
}

// Global error handlers — catch unhandled errors and promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
window.onerror = (_message, _source, _lineno, _colno, error) => {
  console.error('Uncaught error:', error);
};

// Detect extension early (before auth) to catch BB_EXT_INSTALLED at document_idle
initExtensionDetection();

// Render the HTML shell
renderApp();

// Initialize all modal event listeners
initBookmarkModal();
initCategoryModal();
initSettingsModal();
initConfirmModal();
initUploadArea();

// Wire header action buttons
document.getElementById('add-category-btn')!.addEventListener('click', openAddCategoryModal);
document.getElementById('theme-toggle-btn')!.addEventListener('click', () => {
  toggleTheme();
  syncWireframeBtnState();
});
document.getElementById('settings-btn')!.addEventListener('click', openSettingsModal);
document.getElementById('barscale-btn')!.addEventListener('click', cycleBarscale);
document.getElementById('wireframe-btn')!.addEventListener('click', () => {
  toggleWireframe();
  syncWireframeBtnState();
});

// Easter eggs on brand text — responsive (mobile taps full words, desktop taps individual letters)
const isMobileQuery = window.matchMedia('(max-width: 768px)');

function syncWireframeBtnState(): void {
  const isWF = document.documentElement.hasAttribute('data-wireframe');
  document.getElementById('wireframe-btn')?.classList.toggle('wireframe-active', isWF);
  document.getElementById('mobile-wireframe-btn')?.classList.toggle('wireframe-active', isWF);
}

// Desktop easter eggs (u / r letters)
document.getElementById('brand-u')?.addEventListener('click', (e) => {
  if (!getEasterEggs() || isMobileQuery.matches) return;
  e.stopPropagation();
  randomizeAccentHue();
});
document.getElementById('brand-r')?.addEventListener('click', (e) => {
  if (!getEasterEggs() || isMobileQuery.matches) return;
  e.stopPropagation();
  runInUndoGroup(() => {
    randomizeAccentHue();
    randomizeBarscale();
    randomizeWireframe();
  });
  syncWireframeBtnState();
});

// Mobile easter eggs (full words "Brute" / "Bookmarks")
document.getElementById('brand-brute')?.addEventListener('click', () => {
  if (!getEasterEggs() || !isMobileQuery.matches) return;
  randomizeAccentHue();
});
document.getElementById('brand-bookmarks')?.addEventListener('click', () => {
  if (!getEasterEggs() || !isMobileQuery.matches) return;
  runInUndoGroup(() => {
    randomizeAccentHue();
    randomizeBarscale();
    randomizeWireframe();
  });
  syncWireframeBtnState();
});

// Wire icon picker buttons
document.getElementById('use-favicon-btn')!.addEventListener('click', useFavicon);
document.getElementById('search-wikimedia-btn')!.addEventListener('click', toggleIconSearch);
document.getElementById('use-emoji-btn')!.addEventListener('click', toggleEmojiSearch);
document.getElementById('upload-custom-btn')!.addEventListener('click', () => {
  // Hide other search panels
  document.getElementById('icon-search-container')!.classList.add('hidden');
  document.getElementById('emoji-search-container')!.classList.add('hidden');
  // Show upload area and set active button
  setActiveIconButton('custom');
});
document.getElementById('icon-search-btn')!.addEventListener('click', searchIcons);
document.getElementById('emoji-search-query')!.addEventListener('input', searchEmojis);

// Delegate click events from dynamically rendered content
document.getElementById('categories-container')!.addEventListener('click', (e) => {
  if (consumeLongPressGuard()) return;
  const target = e.target as HTMLElement;

  // Category edit button
  const categoryEditBtn = target.closest('.category-edit-btn') as HTMLElement | null;
  if (categoryEditBtn) {
    let categoryId = categoryEditBtn.dataset.categoryId;
    if (!categoryId) {
      // Tab group: resolve from the currently active tab
      const activeTab = categoryEditBtn.closest('.tab-group')?.querySelector('.tab-active') as HTMLElement | null;
      categoryId = activeTab?.dataset.tabCategoryId;
    }
    if (categoryId) openEditCategoryModal(categoryId);
    return;
  }

  // Add bookmark button
  const addBookmarkCard = target.closest('[data-action="add-bookmark"]') as HTMLElement | null;
  if (addBookmarkCard) {
    openAddBookmarkModal(addBookmarkCard.dataset.categoryId!);
    return;
  }

  // Edit bookmark button
  const editBookmarkBtn = target.closest('[data-action="edit-bookmark"]') as HTMLElement | null;
  if (editBookmarkBtn) {
    e.stopPropagation();
    openEditBookmarkModal(editBookmarkBtn.dataset.categoryId!, editBookmarkBtn.dataset.bookmarkId!);
    return;
  }

  // Delete bookmark button
  const deleteBookmarkBtn = target.closest('[data-action="delete-bookmark"]') as HTMLElement | null;
  if (deleteBookmarkBtn) {
    e.stopPropagation();
    deleteBookmark(deleteBookmarkBtn.dataset.categoryId!, deleteBookmarkBtn.dataset.bookmarkId!);
    return;
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Undo/Redo — skip when typing in form inputs
  const tag = (e.target as HTMLElement).tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.key === 'z' && e.shiftKey) || (e.key === 'y' && !e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
      }
    }
  }

  if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    toggleTheme();
    syncWireframeBtnState();
    return;
  }

  if (e.key === 'Escape') {
    dismissTopModal();
  }
});

// Flush preferences to Convex when leaving the page (prevents lost saves on refresh)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSyncToConvex();
});

// Wire mobile toolbar buttons
function wireMobileToolbar(): void {
  document.getElementById('mobile-add-btn')?.addEventListener('click', openAddCategoryModal);
  document.getElementById('mobile-theme-btn')?.addEventListener('click', () => {
    toggleTheme();
    syncWireframeBtnState();
  });
  document.getElementById('mobile-settings-btn')?.addEventListener('click', openSettingsModal);
  document.getElementById('mobile-wireframe-btn')?.addEventListener('click', () => {
    toggleWireframe();
    syncWireframeBtnState();
  });
}

// Wire avatar buttons to trigger sign-in when in local mode
function wireAvatarSignIn(): void {
  for (const id of ['clerk-user-button', 'mobile-avatar-btn']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      if (getAppMode() !== 'local') return;
      if (document.getElementById('auth-overlay')) return;
      upgradeToSync();
    });
  }
}

const STARTUP_WATERMARK_TIMEOUT_MS = 450;
let startupMetricsLogged = false;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

function markStartup(name: string): void {
  performance.mark(name);
}

function measureStartup(name: string, start: string, end: string): void {
  try {
    performance.measure(name, start, end);
  } catch {
    // ignore missing marks
  }
}

function logStartupMetrics(): void {
  if (startupMetricsLogged) return;
  startupMetricsLogged = true;
  const metrics = performance
    .getEntriesByType('measure')
    .filter((e) => e.name.startsWith('bb:start:'))
    .map((e) => `${e.name}=${Math.round(e.duration)}ms`);
  if (metrics.length) {
    console.log('[Startup]', metrics.join(' | '));
  }
}

async function maybeRenderSyncCache(convexClient: NonNullable<ReturnType<typeof initConvexClient>>): Promise<void> {
  const localMeta = getSnapshotCacheMeta();
  if (!localMeta) return;

  markStartup('bb:start:watermark:request');
  const watermark = await withTimeout(
    convexClient.query(api.syncMeta.getWatermark, {}),
    STARTUP_WATERMARK_TIMEOUT_MS,
  );

  if (!watermark) {
    markStartup('bb:start:watermark:timeout');
    measureStartup('bb:start:watermark-latency', 'bb:start:init', 'bb:start:watermark:timeout');
    return;
  }

  markStartup('bb:start:watermark:response');
  measureStartup('bb:start:watermark-latency', 'bb:start:init', 'bb:start:watermark:response');

  if (watermark.source === 'watermark') {
    setSyncWatermark(watermark);
  }

  if (!shouldRenderSnapshotCache(localMeta, watermark)) return;
  if (hasConvexHydrated()) return;

  renderCategories();
  markStartup('bb:start:cache-render');
  measureStartup('bb:start:time-to-cache-render', 'bb:start:init', 'bb:start:cache-render');
  logStartupMetrics();
}

// Initialize app data and render
async function init(): Promise<void> {
  markStartup('bb:start:init');

  let firstLiveRenderMeasured = false;
  // Wire callbacks so Convex subscriptions can trigger re-renders
  // Route subscription re-renders through DragController so DOM isn't
  // destroyed mid-drag (would release pointer capture and break the drag).
  setRenderCallback(() => {
    if (!firstLiveRenderMeasured && hasConvexHydrated()) {
      firstLiveRenderMeasured = true;
      markStartup('bb:start:live-render');
      measureStartup('bb:start:time-to-live-render', 'bb:start:init', 'bb:start:live-render');
      logStartupMetrics();
    }
    dragController.requestRender(renderCategories);
  });
  setPreferencesCallback((prefs) => {
    applyTheme(prefs.theme, prefs.accentColorDark, prefs.accentColorLight);
    applyPreferences(prefs, renderCategories);
    syncWireframeBtnState();
  });
  setPreferencesCollector(collectPreferences);

  // Load bookmarks first — don't wait for auth
  await initializeData();

  // Register post-undo/redo UI sync
  setAfterUndoRedoCallback(() => {
    syncWireframeBtnState();
    (window as any).__refreshSizeHandle?.();
  });

  // Sync UI controls with restored preferences
  syncThemeUI();
  syncPreferencesUI();
  initBarscaleAndWireframe();
  if (getWireframe()) {
    syncWireframeBtnState();
  }

  const mode = getAppMode();
  if (mode === 'sync') {
    renderStartupShell();
    markStartup('bb:start:shell-render');
    measureStartup('bb:start:time-to-shell-render', 'bb:start:init', 'bb:start:shell-render');
  } else {
    renderCategories();
    markStartup('bb:start:local-render');
    measureStartup('bb:start:time-to-local-render', 'bb:start:init', 'bb:start:local-render');
  }

  // Apply saved settings
  updateCardSize(getCardSize());
  updatePageWidth(getPageWidth());

  // Initialize the 2D size controller
  initSizeController();

  // Wire mobile toolbar buttons
  wireMobileToolbar();

  if (mode === null) {
    // First visit — show welcome gate
    const choice = await showWelcomeGate();
    setAppMode(choice);
    hideWelcomeGate();

    if (choice === 'local') {
      seedLocalDefaults();
      wireAvatarSignIn();
      return;
    }
    // choice === 'sync' — fall through to Clerk init
  } else if (mode === 'local') {
    // Local mode — skip Clerk entirely
    wireAvatarSignIn();
    return;
  }

  // Sync mode — initialize auth
  initClerk().then((clerk) => {
    if (!clerk) return;

    const startConvex = () => {
      if (getConvexClient()) return; // Already initialized
      const convexClient = initConvexClient();
      if (convexClient) {
        setConvexAuth(() => getAuthToken({ template: 'convex' }));
        void maybeRenderSyncCache(convexClient);
        activateConvex();
      }
      initExtensionBridge();
    };

    if (clerk.user) {
      // Already signed in — activate immediately
      startConvex();
    } else {
      // Not signed in — wait for sign-in via overlay
      const unsub = clerk.addListener(({ user }) => {
        if (user && getAppMode() === 'sync') {
          unsub?.();
          startConvex();
        }
      });
    }
  });
}

/**
 * Upgrade from local mode to sync mode.
 * Called from settings modal when a local user wants to sign up.
 */
export async function upgradeToSync(): Promise<void> {
  setAppMode('sync');

  const signedIn = await triggerSignIn();
  if (!signedIn) {
    // User abandoned sign-in — revert to local
    setAppMode('local');
    return;
  }

  // Wire Convex
  const convexClient = initConvexClient();
  if (convexClient) {
    setConvexAuth(() => getAuthToken({ template: 'convex' }));
    activateConvex();
    // rebuild() → promptMigration() in store.ts handles pushing localStorage data to Convex
  }

  initExtensionBridge();
}

init();
