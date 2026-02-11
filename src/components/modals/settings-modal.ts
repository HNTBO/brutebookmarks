import { getCategories, setCategories, saveData, importBulk, isConvexMode } from '../../data/store';
import { renderCategories } from '../categories';
import { toggleCardNames, getShowCardNames } from '../../features/preferences';
import { updateAccentColor, resetAccentColor } from '../../features/theme';

export function openSettingsModal(): void {
  document.getElementById('settings-modal')!.classList.add('active');
  (document.getElementById('show-card-names') as HTMLInputElement).checked = getShowCardNames();
}

export function closeSettingsModal(): void {
  document.getElementById('settings-modal')!.classList.remove('active');
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

function importData(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedData = JSON.parse(event.target!.result as string);
          if (confirm('Replace all current data?')) {
            if (isConvexMode()) {
              await importBulk(importedData);
            } else {
              setCategories(importedData);
              saveData();
              renderCategories();
            }
            alert('Import successful');
          }
        } catch {
          alert('Invalid file format');
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
}

export function initSettingsModal(): void {
  document.getElementById('settings-modal-close')!.addEventListener('click', closeSettingsModal);

  document.getElementById('show-card-names')!.addEventListener('change', (e) => {
    toggleCardNames((e.target as HTMLInputElement).checked, renderCategories);
  });

  document.getElementById('accent-color-picker')!.addEventListener('input', (e) => {
    updateAccentColor((e.target as HTMLInputElement).value);
  });

  document.getElementById('reset-accent-btn')!.addEventListener('click', resetAccentColor);
  document.getElementById('export-data-btn')!.addEventListener('click', exportData);
  document.getElementById('import-data-btn')!.addEventListener('click', importData);

  // Backdrop close for settings
  let mouseDownOnBackdrop = false;
  const modal = document.getElementById('settings-modal')!;
  modal.addEventListener('mousedown', (e) => {
    mouseDownOnBackdrop = e.target === modal;
  });
  modal.addEventListener('mouseup', (e) => {
    if (mouseDownOnBackdrop && e.target === modal) {
      closeSettingsModal();
    }
    mouseDownOnBackdrop = false;
  });
}
