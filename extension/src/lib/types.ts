/** Minimal types shared between extension and main app. */

export interface Category {
  _id: string;
  name: string;
  order: number;
  groupId?: string;
}

export interface Bookmark {
  _id: string;
  title: string;
  url: string;
  categoryId: string;
  order: number;
}

export type PopupView =
  | 'onboarding'
  | 'loading'
  | 'categories'
  | 'success'
  | 'already-saved'
  | 'error';
