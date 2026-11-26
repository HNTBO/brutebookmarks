import { getCategories, importBulk, eraseAllData, isConvexMode, rerender, updateBookmark, replaceBookmarkIcon } from '../../data/store';
import { getConvexClient } from '../../data/convex-client';
import { api } from '../../../convex/_generated/api';
import { wireModalSwipeDismiss } from '../../utils/modal-swipe-dismiss';
import { registerModal } from '../../utils/modal-manager';
import { renderCategories } from '../categories';
import { detectIconType } from '../icon-picker';
import { toggleCardNames, getShowCardNames, toggleAutofillUrl, getAutofillUrl, toggleOpenBookmarksInNewTab, getOpenBookmarksInNewTab, toggleUseBruteProfilePicture, getUseBruteProfilePicture, toggleEasterEggs, getEasterEggs, toggleShowNameOnHover, getShowNameOnHover, getMobileColumns, setMobileColumns } from '../../features/preferences';
import { updateAccentColor, resetAccentColor } from '../../features/theme';
import { styledConfirm, styledAlert } from './confirm-modal';
import { detectFormat, parseNetscapeHTML, parseJSON } from '../../utils/bookmark-parsers';
import { isExtensionInstalled, requestBrowserBookmarks } from '../../utils/extension-bridge';
import { convertBrowserBookmarks } from '../../utils/browser-bookmark-converter';
import { cachedFavicons, discoveredIcon, loadFavicon, localFavicon } from '../../data/favicon-lookup';
import type { Bookmark, Category } from '../../types';
import { getAppMode } from '../../data/local-storage';
import { getFoundingMemberStats } from '../../data/founding-stats';
import { pushUndo } from '../../features/undo';
import { isImportCapacityError } from '../../shared/import-capacity';

let settingsBusy = false;
let accentPickerOldColor: string | null = null;

export function openSettingsModal(): void {
  document.getElementById('settings-modal')!.classList.add('active');
  (document.getElementById('show-card-names') as HTMLInputElement).checked = getShowCardNames();
  (document.getElementById('autofill-url') as HTMLInputElement).checked = getAutofillUrl();
  (document.getElementById('open-bookmarks-in-new-tab') as HTMLInputElement).checked = getOpenBookmarksInNewTab();
  (document.getElementById('use-brute-picture-profile') as HTMLInputElement).checked = getUseBruteProfilePicture();
  (document.getElementById('easter-eggs') as HTMLInputElement).checked = getEasterEggs();
  (document.getElementById('show-name-on-hover') as HTMLInputElement).checked = getShowNameOnHover();
  syncColumnPicker();
  populateAccountSection();
}

function populateAccountSection(): void {
  const section = document.getElementById('settings-account-section');
  if (!section) return;

  const mode = getAppMode();
  document.getElementById('brute-profile-picture-row')?.classList.toggle('hidden', mode !== 'sync');

  if (mode === 'local') {
    section.innerHTML = `
      <h3>Account</h3>
      <div class="settings-row">
        <span class="account-status-text">Using locally (this browser only)</span>
      </div>
      <div class="settings-row settings-upgrade-row">
        <button class="account-upgrade-btn" id="upgrade-sync-btn">Sign In for Cross-Device Sync</button>
        <span class="account-note">Free for founding members <span id="settings-founding-count"></span></span>
      </div>
    `;

    // Fetch founding count
    getFoundingMemberStats().then((stats) => {
      const el = document.getElementById('settings-founding-count');
      if (el) el.textContent = `(${stats.count} / ${stats.cap} claimed)`;
    });

    document.getElementById('upgrade-sync-btn')!.addEventListener('click', async () => {
      closeSettingsModal();
      // Dynamic import to avoid circular dependency (main.ts imports settings-modal.ts)
      const { upgradeToSync } = await import('../../main');
      await upgradeToSync();
    });
  } else if (mode === 'sync') {
    section.innerHTML = `
      <h3>Account</h3>
      <div class="account-status">
        <span class="account-status-text">Synced across devices</span>
        <span class="account-badge">Founding Member</span>
      </div>
    `;
  } else {
    section.innerHTML = '';
  }
}

export function closeSettingsModal(): void {
  document.getElementById('settings-modal')!.classList.remove('active');
  (document.activeElement as HTMLElement | null)?.blur();
}

function closeHelpModal(): void {
  document.getElementById('help-modal')!.classList.remove('active');
}

function getDesktopHelpContent(): string {
  return `
    <div class="help-section">
      <h3>Bookmarks</h3>
      <ul>
        <li><strong>Add</strong> — Click the + card at the end of any category</li>
        <li><strong>Edit</strong> — Hover near the top-left corner of a card (pen icon)</li>
        <li><strong>Delete</strong> — Hover near the top-right corner (× icon)</li>
        <li><strong>Open</strong> — Click a card to open the bookmark</li>
        <li><strong>Reorder</strong> — Drag and drop cards within or between categories</li>
        <li><strong>Move</strong> — Use the Category dropdown in the edit modal</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Categories</h3>
      <ul>
        <li><strong>Add</strong> — Click the + button in the header</li>
        <li><strong>Edit/Delete</strong> — Click the pen icon on the category bar</li>
        <li><strong>Reorder</strong> — Drag the ⠿ handle on the category bar</li>
        <li><strong>Tab Groups</strong> — Drag a category onto another to group them as tabs</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Appearance</h3>
      <ul>
        <li><strong>Card Size & Page Width</strong> — Drag inside the 2D controller zone in the header</li>
        <li><strong>Theme</strong> — ☀/☾ button toggles light/dark mode</li>
        <li><strong>Accent Color</strong> — Color picker in Settings</li>
        <li><strong>Wireframe Mode</strong> — Outlined UI style (cube icon in header)</li>
        <li><strong>Bar Scale</strong> — Cycle category bar height (triangle icon in header)</li>
        <li><strong>Card Names</strong> — Toggle in Settings</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Data</h3>
      <ul>
        <li><strong>Import</strong> — JSON backups or browser HTML exports</li>
        <li><strong>Export</strong> — Download as JSON</li>
        <li><strong>Smart Name</strong> — Auto-shorten bookmark titles</li>
        <li><strong>Fetch Favicons</strong> — Refresh all bookmark icons</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Keyboard Shortcuts</h3>
      <ul>
        <li><kbd>Ctrl</kbd> + <kbd>Z</kbd> — Undo</li>
        <li><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> — Redo</li>
        <li><kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> — Toggle theme</li>
        <li><kbd>Esc</kbd> — Close any open modal</li>
      </ul>
    </div>`;
}

function getMobileHelpContent(): string {
  return `
    <div class="help-section">
      <h3>Bookmarks</h3>
      <ul>
        <li><strong>Add</strong> — Tap the + card at the end of any category</li>
        <li><strong>Edit / Delete</strong> — Long-press a card for the context menu</li>
        <li><strong>Open</strong> — Tap a card to open the bookmark</li>
        <li><strong>Reorder</strong> — Long-press then drag to move cards</li>
        <li><strong>Move</strong> — Use the Category dropdown in the edit modal</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Categories</h3>
      <ul>
        <li><strong>Add</strong> — Tap the + button in the toolbar</li>
        <li><strong>Edit/Delete</strong> — Tap the pen icon on the category bar</li>
        <li><strong>Reorder</strong> — Drag the ⠿ handle on the category bar</li>
        <li><strong>Tab Groups</strong> — Drag a category onto another to group them as tabs</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Tab Navigation</h3>
      <ul>
        <li><strong>Switch Tabs</strong> — Swipe left or right to move between tabs</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Appearance</h3>
      <ul>
        <li><strong>Card Size & Page Width</strong> — Drag inside the 2D controller zone in the header</li>
        <li><strong>Theme</strong> — ☀/☾ button toggles light/dark mode</li>
        <li><strong>Accent Color</strong> — Color picker in Settings</li>
        <li><strong>Wireframe Mode</strong> — Outlined UI style (cube icon in header)</li>
        <li><strong>Bar Scale</strong> — Cycle category bar height (triangle icon in header)</li>
        <li><strong>Card Names</strong> — Toggle in Settings</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Tips</h3>
      <ul>
        <li><strong>Undo / Redo</strong> — Long-press the + card</li>
        <li><strong>Dismiss Modals</strong> — Swipe down on the header bar</li>
      </ul>
    </div>`;
}

function populateHelpModal(): void {
  const body = document.querySelector('#help-modal .help-body');
  if (!body) return;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  body.innerHTML = isMobile ? getMobileHelpContent() : getDesktopHelpContent();
}

function exportData(): void {
  const dataStr = JSON.stringify(getCategories(), null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'brute-bookmarks-backup.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(): Promise<void> {
  closeSettingsModal();

  const choice = await styledConfirm(
    'Import bookmarks from a file or directly from your browser?',
    'Import',
    'From File',
    'From Browser',
  );

  if (choice === null) return;
  if (choice) {
    importFromFile();
  } else {
    await importFromBrowser();
  }
}

function importFromFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.html,.htm';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onerror = () => { void styledAlert('Could not read the selected file.', 'Import'); };
      reader.onload = async (event) => {
        let importedData: Category[];
        try {
          const content = event.target!.result as string;
          const format = detectFormat(content);

          if (format === 'json' || format === 'netscape-html') {
            const { categories, oversizedImages } = format === 'json' ? parseJSON(content) : parseNetscapeHTML(content);
            if (oversizedImages > 0) {
              const images = oversizedImages === 1 ? 'image' : 'images';
              const skip = await styledConfirm(
                `This file contains ${oversizedImages} embedded ${images} over the 50,000-character limit. Skip the oversized ${images} and keep all bookmarks and other icons?`,
                'Oversized images', `Skip oversized ${images}`, 'Cancel',
              );
              if (!skip) return;
            }
            importedData = categories;
          } else {
            await styledAlert('Unrecognized file format. Please use a JSON backup or browser HTML export.', 'Import');
            return;
          }
        } catch (error) {
          await styledAlert(error instanceof Error ? error.message : 'Invalid file format.', 'Import');
          return;
        }
        await executeImport(importedData);
      };
      reader.readAsText(file);
    }
  };
  input.click();
}

async function importFromBrowser(): Promise<void> {
  if (!isExtensionInstalled()) {
    await styledAlert(
      'The Brute Bookmarks browser extension is required to import directly from your browser. Install it and reload this page.',
      'Import',
    );
    return;
  }

  try {
    const tree = await requestBrowserBookmarks();
    const importedData = convertBrowserBookmarks(tree);

    if (importedData.length === 0) {
      await styledAlert('No bookmarks found in your browser.', 'Import');
      return;
    }

    await executeImport(importedData);
  } catch (err) {
    await styledAlert(
      err instanceof Error ? err.message : 'Failed to read browser bookmarks.',
      'Import',
    );
  }
}

async function executeImport(importedData: Category[]): Promise<void> {
  if (importedData.length === 0) {
    await styledAlert('No bookmarks found.', 'Import');
    return;
  }

  let replace = false;
  if (getCategories().length > 0) {
    const choice = await styledConfirm(
      'You have existing bookmarks. Replace them or append?',
      'Import',
      'Replace',
      'Append',
    );
    if (choice === null) return;
    replace = choice;
  }

  try {
    await importBulk(importedData, replace);
  } catch (error) {
    const reason = importFailureMessage(error);
    const embeddedCount = importedData.reduce((sum, cat) => sum + cat.bookmarks.filter(b => b.iconPath?.startsWith('data:')).length, 0);
    if (!isImportCapacityError(error) || !embeddedCount) {
      await styledAlert(`Import failed. ${reason}`, 'Import');
      return;
    }
    const retry = await styledConfirm(
      `${reason} Retry ${replace ? 'replacing your library' : 'appending the bookmarks'} without the ${embeddedCount} incoming embedded ${embeddedCount === 1 ? 'image' : 'images'}? All incoming bookmarks and linked icons will be kept.`,
      'Import', 'Retry without images', 'Cancel',
    );
    if (!retry) return;
    const withoutImages = importedData.map(cat => ({
      ...cat,
      bookmarks: cat.bookmarks.map(b => b.iconPath?.startsWith('data:') ? { ...b, iconPath: null, importedFavicon: undefined } : b),
    }));
    try {
      await importBulk(withoutImages, replace);
    } catch (retryError) {
      await styledAlert(`Retry failed. ${importFailureMessage(retryError)}`, 'Import');
      return;
    }
  }
  if (!isConvexMode()) rerender();

  const totalBookmarks = importedData.reduce((sum, cat) => sum + cat.bookmarks.length, 0);
  await styledAlert(
    `Imported ${importedData.length} ${importedData.length === 1 ? 'category' : 'categories'} with ${totalBookmarks} ${totalBookmarks === 1 ? 'bookmark' : 'bookmarks'}.`,
    'Import',
  );
}

function importFailureMessage(error: unknown): string {
  if (isImportCapacityError(error)) {
    return isConvexMode() ? 'The import exceeds the sync storage limit.' : 'This browser has insufficient storage for the import.';
  }
  return error instanceof Error ? error.message : 'Could not save the import.';
}

async function fetchAllFavicons(): Promise<void> {
  const btn = document.getElementById('fetch-favicons-btn') as HTMLButtonElement;
  const modalContent = document.querySelector('#settings-modal .modal-content') as HTMLElement;
  btn.textContent = 'Finding best favicons...';
  settingsBusy = true;
  modalContent.style.pointerEvents = 'none';
  modalContent.style.opacity = '0.6';

  try {
    const categories = getCategories();

    // Refresh automatic icons in both local and sync mode. Keep the user's selections.
    const allBookmarks: Bookmark[] = [];
    for (const cat of categories) {
      for (const bk of cat.bookmarks) {
        const iconType = detectIconType(bk.iconPath, bk.importedFavicon);
        if (iconType === 'custom' || iconType === 'emoji' || iconType === 'wikimedia') continue;
        try {
          new URL(bk.url); // validate
          allBookmarks.push({ ...bk });
        } catch {
          // Invalid URL — skip
        }
      }
    }

    // Count unique domains for progress
    const uniqueDomains = new Set(allBookmarks.map((bk) => new URL(bk.url).hostname));

    let updated = 0;

    const synced = isConvexMode();
    const domains = [...uniqueDomains];
    const candidates = new Map<string, string>();
    if (synced) {
      btn.textContent = `Finding best favicons... (${domains.length} domains)`;
      const results = await getConvexClient()!.action(api.favicons.resolveFaviconBulk, {
        bookmarks: allBookmarks.map(b => ({ bookmarkId: b.id, url: b.url })),
        forceRefresh: true,
      });
      for (const result of results) {
        const icon = discoveredIcon(result);
        if (icon) candidates.set(result.bookmarkId, icon);
      }
    } else {
      btn.textContent = 'Checking favicon cache...';
      const cached = await cachedFavicons(domains).catch(() => new Map<string, string>());
      for (const bk of allBookmarks) {
        const domain = new URL(bk.url).hostname;
        const icon = cached.get(domain) ?? localFavicon(domain);
        if (icon) candidates.set(bk.id, icon);
      }
    }

    const urls = new Set<string>();
    for (const bk of allBookmarks) {
      const icon = candidates.get(bk.id);
      if (icon && icon !== bk.iconPath) urls.add(icon);
    }
    const remaining = urls.values();
    const loaded = new Set<string>();
    let checked = 0;
    async function validateImages() {
      for (const icon of remaining) {
        if (isConvexMode() !== synced) break;
        if ((await loadFavicon(icon)).status === 'found') loaded.add(icon);
        btn.textContent = `Checking favicon images... (${++checked}/${urls.size})`;
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, urls.size) }, validateImages));
    for (const [index, bk] of allBookmarks.entries()) {
      if (isConvexMode() !== synced) break;
      const icon = candidates.get(bk.id);
      if (icon && icon !== bk.iconPath && loaded.has(icon)) {
        if (await replaceBookmarkIcon(bk, icon)) updated++;
      }
      btn.textContent = `Updating favicons... (${index + 1}/${allBookmarks.length})`;
    }

    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Fetch Favicons';
    closeSettingsModal();
    await styledAlert(`Updated favicons for ${updated} bookmark${updated !== 1 ? 's' : ''}.`, 'Favicons');
  } catch (e) {
    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Fetch Favicons';
    throw e;
  }
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'at', 'by',
  'with', 'and', 'or', 'my', 'your', 'our', 'is', 'it', 'its',
  'this', 'that', 'app', 'home',
]);

const DOMAIN_NOISE = new Set([
  'com', 'org', 'net', 'io', 'co', 'www',
  'html', 'htm', 'php', 'asp', 'aspx', 'jsp',
]);

function computeSmartName(title: string): string {
  // Strip trailing noise after common separators
  const stripped = title.split(/\s[-|—:·]\s/)[0].trim();

  // Expand dot-containing tokens into parts, filtering TLDs and short segments
  const tokens = stripped.split(/\s+/).flatMap(w =>
    w.includes('.') ? w.split('.').filter(p =>
      p.length > 2 && !DOMAIN_NOISE.has(p.toLowerCase())
    ) : [w]
  );

  const meaningful = tokens.filter(w =>
    w.length > 0 &&
    !STOP_WORDS.has(w.toLowerCase()) &&
    !w.includes('=') && !w.includes('/') && !w.includes('#')
  );

  if (meaningful.length === 0) return title;

  const kept = meaningful.slice(0, 2);
  return kept.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function smartNameAll(): Promise<void> {
  const btn = document.getElementById('smart-name-btn') as HTMLButtonElement;
  const modalContent = document.querySelector('#settings-modal .modal-content') as HTMLElement;
  btn.textContent = 'Renaming';
  settingsBusy = true;
  modalContent.style.pointerEvents = 'none';
  modalContent.style.opacity = '0.6';

  try {
    const categories = getCategories();
    let updated = 0;

    for (const cat of categories) {
      for (const bk of cat.bookmarks) {
        const smart = computeSmartName(bk.title);
        if (smart !== bk.title) {
          await updateBookmark(bk.id, smart, bk.url, bk.iconPath);
          updated++;
        }
      }
    }

    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Smart Name';
    closeSettingsModal();
    await styledAlert(`Renamed ${updated} bookmark${updated !== 1 ? 's' : ''}.`, 'Smart Name');
  } catch (e) {
    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Smart Name';
    throw e;
  }
}

async function eraseData(): Promise<void> {
  closeSettingsModal();
  if (await styledConfirm('This will permanently erase all your bookmarks.', 'Erase')) {
    await eraseAllData();
    await styledAlert('All bookmarks erased.', 'Erase');
  }
}

function syncColumnPicker(): void {
  const cols = getMobileColumns();
  document.querySelectorAll('.column-picker-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.columns === String(cols));
  });
}

export function initSettingsModal(): void {
  registerModal('settings-modal', closeSettingsModal);
  registerModal('help-modal', closeHelpModal);

  document.getElementById('settings-modal-close')!.addEventListener('click', closeSettingsModal);

  document.getElementById('show-card-names')!.addEventListener('change', (e) => {
    toggleCardNames((e.target as HTMLInputElement).checked, renderCategories);
  });

  document.getElementById('autofill-url')!.addEventListener('change', (e) => {
    toggleAutofillUrl((e.target as HTMLInputElement).checked);
  });

  document.getElementById('open-bookmarks-in-new-tab')!.addEventListener('change', (e) => {
    toggleOpenBookmarksInNewTab((e.target as HTMLInputElement).checked);
  });

  document.getElementById('use-brute-picture-profile')!.addEventListener('change', (e) => {
    toggleUseBruteProfilePicture((e.target as HTMLInputElement).checked);
  });

  document.getElementById('easter-eggs')!.addEventListener('change', (e) => {
    toggleEasterEggs((e.target as HTMLInputElement).checked);
  });

  document.getElementById('show-name-on-hover')!.addEventListener('change', (e) => {
    toggleShowNameOnHover((e.target as HTMLInputElement).checked);
    renderCategories();
  });

  // Column picker
  document.querySelectorAll('.column-picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cols = parseInt((btn as HTMLElement).dataset.columns!) as 3 | 4 | 5;
      setMobileColumns(cols);
      syncColumnPicker();
      renderCategories();
    });
  });

  document.getElementById('accent-color-picker')!.addEventListener('input', (e) => {
    if (accentPickerOldColor === null) {
      accentPickerOldColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    }
    updateAccentColor((e.target as HTMLInputElement).value);
  });

  document.getElementById('accent-color-picker')!.addEventListener('change', (e) => {
    const newColor = (e.target as HTMLInputElement).value;
    if (accentPickerOldColor !== null && accentPickerOldColor !== newColor) {
      const oldColor = accentPickerOldColor;
      pushUndo({
        undo: () => {
          updateAccentColor(oldColor);
          const p = document.getElementById('accent-color-picker') as HTMLInputElement | null;
          if (p) p.value = oldColor;
        },
        redo: () => {
          updateAccentColor(newColor);
          const p = document.getElementById('accent-color-picker') as HTMLInputElement | null;
          if (p) p.value = newColor;
        },
      });
    }
    accentPickerOldColor = null;
  });

  document.getElementById('reset-accent-btn')!.addEventListener('click', resetAccentColor);
  document.getElementById('smart-name-btn')!.addEventListener('click', smartNameAll);
  document.getElementById('fetch-favicons-btn')!.addEventListener('click', fetchAllFavicons);
  document.getElementById('export-data-btn')!.addEventListener('click', exportData);
  document.getElementById('import-data-btn')!.addEventListener('click', importData);
  document.getElementById('erase-data-btn')!.addEventListener('click', eraseData);

  // Help modal
  document.getElementById('help-btn')!.addEventListener('click', () => {
    populateHelpModal();
    document.getElementById('help-modal')!.classList.add('active');
  });
  document.getElementById('help-modal-close')!.addEventListener('click', closeHelpModal);
  // Backdrop close for help modal (pointer events for mouse/touch/pen parity)
  const helpModal = document.getElementById('help-modal')!;
  let helpPointerDownOnBackdrop = false;
  helpModal.addEventListener('pointerdown', (e) => {
    helpPointerDownOnBackdrop = e.target === helpModal;
  });
  helpModal.addEventListener('pointerup', (e) => {
    if (helpPointerDownOnBackdrop && e.target === helpModal) {
      closeHelpModal();
    }
    helpPointerDownOnBackdrop = false;
  });

  // Backdrop close for settings (pointer events for mouse/touch/pen parity)
  let pointerDownOnBackdrop = false;
  const modal = document.getElementById('settings-modal')!;
  modal.addEventListener('pointerdown', (e) => {
    pointerDownOnBackdrop = e.target === modal;
  });
  modal.addEventListener('pointerup', (e) => {
    if (!settingsBusy && pointerDownOnBackdrop && e.target === modal) {
      closeSettingsModal();
    }
    pointerDownOnBackdrop = false;
  });

  // Mobile swipe-down to dismiss
  wireModalSwipeDismiss('settings-modal', closeSettingsModal);
  wireModalSwipeDismiss('help-modal', closeHelpModal, true);
}
