export interface BookmarkIconState {
  url: string;
  iconPath?: string | null;
  importedFavicon?: true;
}

export function sameBookmarkIcon(current: BookmarkIconState, expected: BookmarkIconState): boolean {
  return current.url === expected.url
    && (current.iconPath ?? null) === (expected.iconPath ?? null)
    && current.importedFavicon === expected.importedFavicon;
}
