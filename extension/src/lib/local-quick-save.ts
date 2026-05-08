export interface LocalBookmark {
  id: string;
  title: string;
  url: string;
  iconPath?: string | null;
  order?: number;
}

export interface LocalCategory {
  id: string;
  name: string;
  order?: number;
  groupId?: string;
  bookmarks: LocalBookmark[];
}

export interface LocalQuickSave {
  id: string;
  categoryId: string;
  title: string;
  url: string;
  createdAt: number;
}

export interface LocalQuickSaveSnapshot {
  version: 1;
  updatedAt: number;
  categories: LocalCategory[];
}

const LOCAL_SNAPSHOT_KEY = 'bb_local_quick_save_snapshot';
const LOCAL_PENDING_KEY = 'bb_local_quick_save_pending';

function normalizeCategories(value: unknown): LocalCategory[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((category): category is LocalCategory => {
      return category
        && typeof category === 'object'
        && typeof category.id === 'string'
        && typeof category.name === 'string'
        && Array.isArray(category.bookmarks);
    })
    .map((category) => ({
      id: category.id,
      name: category.name,
      order: typeof category.order === 'number' ? category.order : undefined,
      groupId: typeof category.groupId === 'string' ? category.groupId : undefined,
      bookmarks: category.bookmarks
        .filter((bookmark): bookmark is LocalBookmark => {
          return bookmark
            && typeof bookmark === 'object'
            && typeof bookmark.id === 'string'
            && typeof bookmark.title === 'string'
            && typeof bookmark.url === 'string';
        })
        .map((bookmark) => ({
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          iconPath: typeof bookmark.iconPath === 'string' ? bookmark.iconPath : null,
          order: typeof bookmark.order === 'number' ? bookmark.order : undefined,
        })),
    }));
}

function normalizePending(value: unknown): LocalQuickSave[] {
  if (!Array.isArray(value)) return [];
  return value.filter((save): save is LocalQuickSave => {
    return save
      && typeof save === 'object'
      && typeof save.id === 'string'
      && typeof save.categoryId === 'string'
      && typeof save.title === 'string'
      && typeof save.url === 'string'
      && typeof save.createdAt === 'number';
  });
}

export async function getLocalSnapshot(): Promise<LocalQuickSaveSnapshot | null> {
  const result = await browser.storage.local.get(LOCAL_SNAPSHOT_KEY);
  const raw = result[LOCAL_SNAPSHOT_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const snapshot = raw as Partial<LocalQuickSaveSnapshot>;
  return {
    version: 1,
    updatedAt: typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : 0,
    categories: normalizeCategories(snapshot.categories),
  };
}

export async function storeLocalSnapshot(categories: LocalCategory[]): Promise<LocalQuickSaveSnapshot> {
  const snapshot: LocalQuickSaveSnapshot = {
    version: 1,
    updatedAt: Date.now(),
    categories: normalizeCategories(categories),
  };
  await browser.storage.local.set({ [LOCAL_SNAPSHOT_KEY]: snapshot });
  return snapshot;
}

export async function getPendingLocalQuickSaves(): Promise<LocalQuickSave[]> {
  const result = await browser.storage.local.get(LOCAL_PENDING_KEY);
  return normalizePending(result[LOCAL_PENDING_KEY]);
}

export async function ackPendingLocalQuickSaves(ids: string[]): Promise<void> {
  const idSet = new Set(ids);
  const pending = await getPendingLocalQuickSaves();
  await browser.storage.local.set({
    [LOCAL_PENDING_KEY]: pending.filter((save) => !idSet.has(save.id)),
  });
}

export async function saveLocalBookmark(
  categoryId: string,
  title: string,
  url: string,
): Promise<{ snapshot: LocalQuickSaveSnapshot; pending: LocalQuickSave }> {
  const snapshot = await getLocalSnapshot();
  if (!snapshot) throw new Error('Open BruteBookmarks once in local mode before using local Quick Save.');

  const categories = normalizeCategories(snapshot.categories);
  const category = categories.find((item) => item.id === categoryId);
  if (!category) throw new Error('Category no longer exists. Open BruteBookmarks to refresh Quick Save.');

  const pending: LocalQuickSave = {
    id: `lqs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryId,
    title,
    url,
    createdAt: Date.now(),
  };

  const maxOrder = category.bookmarks.reduce((max, bookmark) => {
    return Math.max(max, typeof bookmark.order === 'number' ? bookmark.order : 0);
  }, 0);
  category.bookmarks.push({
    id: pending.id,
    title,
    url,
    iconPath: null,
    order: maxOrder + 1,
  });

  const [updatedSnapshot, existingPending] = await Promise.all([
    storeLocalSnapshot(categories),
    getPendingLocalQuickSaves(),
  ]);
  await browser.storage.local.set({ [LOCAL_PENDING_KEY]: [...existingPending, pending] });
  return { snapshot: updatedSnapshot, pending };
}
