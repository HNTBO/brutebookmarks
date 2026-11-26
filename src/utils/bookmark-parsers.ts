import type { Bookmark, Category } from '../types';

type Format = 'netscape-html' | 'json' | 'unknown';

const MAX_URL_LENGTH = 2048;
const MAX_ICON_LENGTH = 50_000; // Convex bookmark iconPath limit, including the data URI header.
const EMBEDDED_ICON_HEADER = /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)(?:;charset=utf-8)?(;base64)?,/i;

function embeddedIcon(value: string | null): string | null {
  if (!value || value.length > MAX_ICON_LENGTH) return null;
  const header = value.match(EMBEDDED_ICON_HEADER);
  if (!header || header[0].length === value.length) return null;
  const payload = value.slice(header[0].length);
  try {
    if (header[1] && !atob(payload).length) return null;
  } catch {
    return null;
  }
  return 'data:' + value.slice(5);
}

export function detectFormat(content: string): Format {
  const trimmed = content.trimStart();
  if (
    trimmed.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>') ||
    trimmed.toUpperCase().startsWith('<DL')
  ) {
    return 'netscape-html';
  }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return 'json';
  }
  return 'unknown';
}

/**
 * Parse Netscape HTML bookmark export format.
 * Used by Chrome, Firefox, Safari, Edge ("Export bookmarks" feature).
 */
export function parseNetscapeHTML(html: string): { categories: Category[]; oversizedImages: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  let oversizedImages = 0;

  const categories: Category[] = [];
  const orphanBookmarks: Bookmark[] = [];

  function isSkippableUrl(href: string): boolean {
    return /^(javascript:|chrome:|about:|edge:|file:|place:)/i.test(href);
  }

  function processFolder(dl: Element, folderName: string | null): void {
    const children = dl.children;
    let currentBookmarks: Bookmark[] = [];
    let currentFolderName = folderName;

    for (let i = 0; i < children.length; i++) {
      const dt = children[i];
      if (dt.tagName !== 'DT') continue;

      const h3 = dt.querySelector(':scope > H3');
      if (h3) {
        // This DT contains a folder — flush any pending bookmarks first
        if (currentBookmarks.length > 0 && currentFolderName) {
          addCategory(currentFolderName, currentBookmarks);
          currentBookmarks = [];
        }

        const subFolderName = cleanFolderName(h3.textContent?.trim() || 'Untitled');
        const subDl = dt.querySelector(':scope > DL');
        if (subDl) {
          processFolder(subDl, subFolderName);
        }
        continue;
      }

      const anchor = dt.querySelector(':scope > A');
      if (anchor) {
        const href = anchor.getAttribute('HREF') || anchor.getAttribute('href') || '';
        if (!href || href.length > MAX_URL_LENGTH || isSkippableUrl(href)) continue;

        const title = anchor.textContent?.trim() || '';
        const rawIcon = anchor.getAttribute('ICON');
        if (rawIcon && rawIcon.length > MAX_ICON_LENGTH && EMBEDDED_ICON_HEADER.test(rawIcon)) oversizedImages++;
        const iconPath = embeddedIcon(rawIcon);
        const bookmark: Bookmark = {
          id: 'b' + Date.now() + Math.random().toString(36).slice(2, 6),
          title: title || href,
          url: href,
          iconPath,
          ...(iconPath && { importedFavicon: true }),
        };

        if (currentFolderName) {
          currentBookmarks.push(bookmark);
        } else {
          orphanBookmarks.push(bookmark);
        }
      }
    }

    // Flush remaining bookmarks for this folder
    if (currentBookmarks.length > 0 && currentFolderName) {
      addCategory(currentFolderName, currentBookmarks);
    }
  }

  function addCategory(name: string, bookmarks: Bookmark[]): void {
    // Merge into existing category if same name
    const existing = categories.find((c) => c.name === name);
    if (existing) {
      for (const bookmark of bookmarks) existing.bookmarks.push(bookmark);
    } else {
      categories.push({
        id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6),
        name,
        bookmarks,
      });
    }
  }

  function cleanFolderName(name: string): string {
    // Normalize common browser folder names
    const map: Record<string, string> = {
      'bookmarks bar': 'Bookmarks Bar',
      'bookmarks toolbar': 'Bookmarks Bar',
      'favourites bar': 'Favorites Bar',
      'other bookmarks': 'Other Bookmarks',
      'other favourites': 'Other Favorites',
    };
    return map[name.toLowerCase()] || name;
  }

  // Find the root <DL> — usually the first one
  const rootDl = doc.querySelector('DL');
  if (rootDl) {
    processFolder(rootDl, null);
  }

  // Orphan bookmarks go into "Imported" category
  if (orphanBookmarks.length > 0) {
    addCategory('Imported', orphanBookmarks);
  }

  return { categories, oversizedImages };
}

/**
 * Parse JSON bookmark export (Brute Bookmarks native format).
 * Validates the structure matches Category[], enforces URL schemes and field lengths.
 */
export function parseJSON(content: string): { categories: Category[]; oversizedImages: number } {
  const data = JSON.parse(content);
  let oversizedImages = 0;

  if (!Array.isArray(data)) {
    throw new Error('Expected an array of categories');
  }

  // Validate structure, URL schemes, and field lengths
  for (const cat of data) {
    if (typeof cat.name !== 'string' || !Array.isArray(cat.bookmarks)) {
      throw new Error('Invalid category structure');
    }
    if (cat.name.length > 200) cat.name = cat.name.slice(0, 200);

    for (const b of cat.bookmarks) {
      if (typeof b.title !== 'string' || typeof b.url !== 'string') {
        throw new Error('Invalid bookmark structure');
      }
      if (!/^https?:\/\//i.test(b.url)) {
        throw new Error(`Invalid URL scheme in bookmark "${b.title.slice(0, 50)}" — only http and https are allowed`);
      }
      if (b.url.length > MAX_URL_LENGTH) {
        throw new Error('Bookmark URL exceeds maximum length');
      }
      if (b.title.length > 500) b.title = b.title.slice(0, 500);
      if (b.iconPath !== undefined && b.iconPath !== null) {
        if (typeof b.iconPath !== 'string') {
          b.iconPath = null;
        } else if (/^data:/i.test(b.iconPath)) {
          if (b.iconPath.length > MAX_ICON_LENGTH && EMBEDDED_ICON_HEADER.test(b.iconPath)) oversizedImages++;
          b.iconPath = embeddedIcon(b.iconPath);
        } else if (b.iconPath.length > MAX_URL_LENGTH || !/^https?:\/\//i.test(b.iconPath)) {
          b.iconPath = null;
        }
      }
      if (b.importedFavicon !== true || !b.iconPath?.startsWith('data:')) delete b.importedFavicon;
    }
  }

  return { categories: data as Category[], oversizedImages };
}
