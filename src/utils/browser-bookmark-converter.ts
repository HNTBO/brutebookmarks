import type { Category } from '../types';
import type { BookmarkTreeNode } from './extension-bridge';

function isSkippableUrl(url: string): boolean {
  return /^(javascript:|chrome:|chrome-extension:|about:|edge:|file:|place:|moz-extension:)/i.test(url);
}

function cleanFolderName(name: string): string {
  const map: Record<string, string> = {
    'bookmarks bar': 'Bookmarks Bar',
    'bookmark bar': 'Bookmarks Bar',
    'bookmarks toolbar': 'Bookmarks Bar',
    'favourites bar': 'Favorites Bar',
    'other bookmarks': 'Other Bookmarks',
    'other favourites': 'Other Favorites',
  };
  return map[name.toLowerCase()] || name;
}

function generateId(prefix: string): string {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 6);
}

export function convertBrowserBookmarks(tree: BookmarkTreeNode[]): Category[] {
  const categories: Category[] = [];

  function addCategory(name: string, bookmarks: { title: string; url: string }[]): void {
    const existing = categories.find((c) => c.name === name);
    if (existing) {
      for (const b of bookmarks) {
        existing.bookmarks.push({
          id: generateId('b'),
          title: b.title,
          url: b.url,
          iconPath: null,
        });
      }
    } else {
      categories.push({
        id: generateId('c'),
        name,
        bookmarks: bookmarks.map((b) => ({
          id: generateId('b'),
          title: b.title,
          url: b.url,
          iconPath: null,
        })),
      });
    }
  }

  function processNode(node: BookmarkTreeNode, folderName: string | null): void {
    if (node.url) {
      if (!isSkippableUrl(node.url) && folderName) {
        addCategory(folderName, [{ title: node.title || node.url, url: node.url }]);
      }
      return;
    }

    if (!node.children) return;

    const resolvedName = node.title ? cleanFolderName(node.title) : folderName;

    // Collect direct bookmark children
    const directBookmarks: { title: string; url: string }[] = [];
    const subFolders: BookmarkTreeNode[] = [];

    for (const child of node.children) {
      if (child.url) {
        if (!isSkippableUrl(child.url)) {
          directBookmarks.push({ title: child.title || child.url, url: child.url });
        }
      } else {
        subFolders.push(child);
      }
    }

    // Add direct bookmarks under this folder
    if (directBookmarks.length > 0 && resolvedName) {
      addCategory(resolvedName, directBookmarks);
    }

    // Recurse into sub-folders
    for (const folder of subFolders) {
      processNode(folder, folder.title ? cleanFolderName(folder.title) : resolvedName);
    }
  }

  // Chrome tree: root[0].children = ["Bookmarks Bar", "Other Bookmarks", "Mobile Bookmarks"]
  // Firefox tree: root[0].children = ["Bookmarks Toolbar", "Bookmarks Menu", "Other Bookmarks"]
  for (const root of tree) {
    if (root.children) {
      for (const topLevel of root.children) {
        processNode(topLevel, topLevel.title ? cleanFolderName(topLevel.title) : null);
      }
    }
  }

  // Any orphan bookmarks at root level
  const orphans: { title: string; url: string }[] = [];
  for (const root of tree) {
    if (root.url && !isSkippableUrl(root.url)) {
      orphans.push({ title: root.title || root.url, url: root.url });
    }
  }
  if (orphans.length > 0) {
    addCategory('Imported', orphans);
  }

  return categories;
}
