export interface Bookmark {
  id: string;
  title: string;
  url: string;
  iconPath: string | null;
  order?: number;
}

export interface Category {
  id: string;
  name: string;
  bookmarks: Bookmark[];
  order?: number;
  groupId?: string;
}

export interface TabGroup {
  id: string;
  name: string;
  order: number;
  categories: Category[];
}

export type LayoutItem =
  | { type: 'category'; category: Category }
  | { type: 'tabGroup'; group: TabGroup };

export interface UserPreferences {
  theme: 'dark' | 'light';
  accentColorDark: string | null;
  accentColorLight: string | null;
  cardSize: number;
  pageWidth: number;
  showCardNames: boolean;
}
