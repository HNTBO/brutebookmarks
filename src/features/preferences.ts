let currentCardSize = parseInt(localStorage.getItem('cardSize') || '90');
let currentPageWidth = parseInt(localStorage.getItem('pageWidth') || '100');
let showCardNames = localStorage.getItem('showCardNames') !== 'false';

export function getCardSize(): number {
  return currentCardSize;
}

export function getPageWidth(): number {
  return currentPageWidth;
}

export function getShowCardNames(): boolean {
  return showCardNames;
}

export function updateCardSize(size: number): void {
  currentCardSize = size;
  const t = (currentCardSize - 60) / 60;
  const gap = Math.round(8 + t * 16);

  document.querySelectorAll<HTMLElement>('.bookmarks-grid').forEach((grid) => {
    grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${currentCardSize}px, 1fr))`;
    grid.style.gap = `${gap}px`;
  });
  localStorage.setItem('cardSize', String(currentCardSize));
}

export function updatePageWidth(width: number): void {
  currentPageWidth = width;
  document.documentElement.style.setProperty('--page-width', `${800 + (currentPageWidth / 100) * 800}px`);
  localStorage.setItem('pageWidth', String(currentPageWidth));
}

export function toggleCardNames(show: boolean, renderCallback: () => void): void {
  showCardNames = show;
  localStorage.setItem('showCardNames', String(showCardNames));
  renderCallback();
}

export function syncPreferencesUI(): void {
  const checkbox = document.getElementById('show-card-names') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = showCardNames;
}
