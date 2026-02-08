import type { Bookmark } from '../types';

export function getIconUrl(bookmark: Bookmark): string {
  if (bookmark.iconPath) {
    return bookmark.iconPath;
  }
  try {
    const domain = new URL(bookmark.url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23333" width="100" height="100"/><text y="65" x="50" text-anchor="middle" font-size="50" fill="%23666">?</text></svg>';
  }
}

export const FALLBACK_ICON =
  'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text y=%2265%22 x=%2250%22 text-anchor=%22middle%22 font-size=%2250%22 fill=%22%23666%22>?</text></svg>';
