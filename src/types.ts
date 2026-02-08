export interface Bookmark {
  id: string;
  title: string;
  url: string;
  iconPath: string | null;
}

export interface Category {
  id: string;
  name: string;
  bookmarks: Bookmark[];
}

export interface UserPreferences {
  theme: 'dark' | 'light';
  accentColorDark: string | null;
  accentColorLight: string | null;
  cardSize: number;
  pageWidth: number;
  showCardNames: boolean;
}
