import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
import { api } from '../../convex/_generated/api';
import { importBulk as importMutation, update as updateMutation } from '../../convex/bookmarks';
import { parseJSON } from '../../src/utils/bookmark-parsers';
import { ConvexError, getConvexSize } from 'convex/values';
import { IMPORT_CAPACITY, isImportCapacityError } from '../../src/shared/import-capacity';

const client = vi.hoisted(() => ({ onUpdate: vi.fn(() => () => {}), mutation: vi.fn() }));
vi.mock('../../src/data/convex-client', () => ({ getConvexClient: () => client }));

const backup = [{ id: 'new', name: 'New', bookmarks: [
  { id: 'new-link', title: 'New link', url: 'https://example.org', iconPath: null },
] }];
const previous = [{ id: 'old', name: 'Old', bookmarks: [] }];

beforeEach(() => {
  vi.resetModules();
  client.mutation.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it('imports a local backup without IDs and keeps valid IDs and appended records addressable', async () => {
  const storage = new Map([['speedDialData', JSON.stringify(previous)]]);
  const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null, setItem,
    removeItem: (key: string) => storage.delete(key),
  });
  const store = await import('../../src/data/store');
  await store.initializeData();
  const legacy = parseJSON('[{"name":"Legacy","bookmarks":[{"title":"Legacy link","url":"https://example.org"}]}]');
  await store.importBulk([...legacy.categories, ...backup], true);
  const [created, kept] = store.getCategories();
  expect(created.id).toBeTruthy();
  expect(created.bookmarks[0].id).toBeTruthy();
  expect(kept).toEqual(backup[0]);
  expect(setItem).toHaveBeenCalledTimes(1);
  await store.importBulk(backup, false);
  const appended = store.getCategories()[2];
  expect(appended.id).not.toBe(kept.id);
  expect(appended.bookmarks[0].id).not.toBe(kept.bookmarks[0].id);
  expect(JSON.parse(storage.get('speedDialData')!)).toEqual(store.getCategories());
});

it('leaves local state untouched on quota failure and treats later cache cleanup as best effort', async () => {
  const storage = new Map([['speedDialData', JSON.stringify(previous)]]);
  const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
  setItem.mockImplementationOnce(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  const removeItem = vi.fn(() => { throw new Error('Synthetic cache failure'); });
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem, removeItem });
  const store = await import('../../src/data/store');
  await store.initializeData();
  const original = store.getCategories();
  const layout = store.getLayoutItems();
  await expect(store.importBulk(backup, true)).rejects.toThrow('Full');
  expect(store.getCategories()).toBe(original);
  expect(store.getLayoutItems()).toBe(layout);
  expect(removeItem).not.toHaveBeenCalled();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await store.importBulk(backup, true);
    expect(warn).toHaveBeenCalledOnce();
    expect(store.getCategories()).toEqual(backup);
    expect(JSON.parse(storage.get('speedDialData')!)).toEqual(backup);
  } finally {
    warn.mockRestore();
  }
});

type Row = { _id: string; table: string; userId: string; name?: string; title?: string; iconPath?: string; importedFavicon?: true };
type Data = { name: string; bookmarks: { title: string; url: string; iconPath?: string; importedFavicon?: true }[] }[];
const originalRows: Row[] = [
  { _id: 'old', table: 'categories', userId: 'mine', name: 'Old' },
  { _id: 'link', table: 'bookmarks', userId: 'mine', title: 'Old link' },
  { _id: 'group', table: 'tabGroups', userId: 'mine' },
  { _id: 'other', table: 'categories', userId: 'someone-else' },
];

// Each client mutation gets its own transaction. The fixture publishes its
// staged rows only after the real registered handler finishes successfully.
function mockDatabase(failInsert: boolean, writeBudget = Infinity) {
  const state = { rows: structuredClone(originalRows), deletes: 0 };
  client.mutation.mockImplementation(async (ref, args: { data: Data; replace?: boolean }) => {
    const rows = structuredClone(state.rows);
    let bytes = 0;
    let bytesRead = 0;
    function chargeWrite(amount: number) {
      bytes += amount;
      if (bytes > writeBudget) throw new Error('Too many bytes written in a single function execution (limit: 16 MiB)');
    }
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: 'mine' }) },
      db: {
        get: async (id: string) => rows.find(row => row._id === id),
        patch: async (id: string, fields: Partial<Row>) => Object.assign(rows.find(row => row._id === id)!, fields),
        query: (table: string) => ({
          withIndex: (index: string, select: (q: { eq: (field: string, user: string) => string }) => string) => {
            expect(index).toBe('by_user');
            const user = select({ eq: (field, value) => { expect(field).toBe('userId'); return value; } });
            const matches = rows.filter(row => row.table === table && row.userId === user);
            return {
              collect: async () => {
                bytesRead += matches.reduce((sum, row) => sum + getConvexSize(row), 0);
                if (bytesRead > 16 * 1024 * 1024) {
                  throw new Error('Too many bytes read in a single function execution (limit: 16777216 bytes).');
                }
                return matches;
              },
              first: async () => matches[0] ?? null,
            };
          },
        }),
        delete: async (id: string) => {
          state.deletes++;
          const index = rows.findIndex(row => row._id === id);
          expect(index).toBeGreaterThanOrEqual(0);
          rows.splice(index, 1);
        },
        insert: async (table: string, fields: Omit<Row, '_id' | 'table'>) => {
          if (table === 'bookmarks' && failInsert) throw new Error('Synthetic write limit');
          chargeWrite(Buffer.byteLength(JSON.stringify(fields)));
          const id = 'generated-' + rows.length;
          rows.push({ ...fields, table, _id: id });
          return id;
        },
      },
    };
    const handler = getFunctionName(ref) === 'bookmarks:update' ? updateMutation : importMutation;
    const registered = handler as typeof importMutation & {
      _handler(context: typeof ctx, args: { data: Data; replace?: boolean }): Promise<void>;
    };
    await registered._handler(ctx, args);
    state.rows = rows;
  });
  return state;
}

it('submits synced Replace as one mutation and preserves all original rows on a late insert failure', async () => {
  const state = mockDatabase(true);
  const store = await import('../../src/data/store');
  store.activateConvex();
  await expect(store.importBulk(backup, true)).rejects.toThrow('Synthetic write limit');
  expect(client.mutation).toHaveBeenCalledTimes(1);
  expect(state.deletes).toBe(3);
  expect(state.rows).toEqual(originalRows);
});

const image = 'data:image/png;base64,' + 'AAAA'.repeat(10_000);
const withIcon = [{ ...backup[0], bookmarks: [{ ...backup[0].bookmarks[0], iconPath: image, importedFavicon: true as const }] }];

it.each([true, false])('rolls back the full sync import and can save the same records without images (replace=%s)', async replace => {
  const state = mockDatabase(false, 2_000);
  const store = await import('../../src/data/store');
  store.activateConvex();
  await expect(store.importBulk(withIcon, replace)).rejects.toMatchObject({ data: IMPORT_CAPACITY });
  expect(state.rows).toEqual(originalRows);
  await store.importBulk(backup, replace);
  expect(state.rows.some(r => r.title === 'New link')).toBe(true);
  expect(state.rows.some(r => r.title === 'Old link')).toBe(!replace);
});

it('keeps a large old library intact when even an image-free sync replacement exceeds the transaction budget', async () => {
  const state = mockDatabase(false);
  for (let i = 0; i < 512; i++) {
    state.rows.push({ _id: 'old-bookmark-' + i, table: 'bookmarks', userId: 'mine', title: String(i), iconPath: image });
  }
  const original = state.rows.slice();
  const store = await import('../../src/data/store');
  store.activateConvex();
  for (const candidate of [withIcon, backup]) {
    await expect(store.importBulk(candidate, true)).rejects.toMatchObject({ data: IMPORT_CAPACITY });
    expect(state.rows).toEqual(original);
  }
  expect(state.deletes).toBe(0);
  expect(client.mutation).toHaveBeenCalledTimes(2);
});

it('preflights oversized Convex arguments before sending a mutation and permits the image-free payload', async () => {
  const store = await import('../../src/data/store');
  store.activateConvex();
  const bookmarks = Array(430).fill(withIcon[0].bookmarks[0]);
  await expect(store.importBulk([{ ...backup[0], bookmarks }], false)).rejects.toMatchObject({ data: IMPORT_CAPACITY });
  expect(client.mutation).not.toHaveBeenCalled();
  await store.importBulk([{ ...backup[0], bookmarks: Array(430).fill(backup[0].bookmarks[0]) }], false);
  expect(client.mutation).toHaveBeenCalledOnce();
});

it('preserves browser icon provenance through a sync import, subscription, backup and edit', async () => {
  const state = mockDatabase(false);
  const store = await import('../../src/data/store');
  store.activateConvex();
  await store.importBulk(withIcon, true);
  const row = state.rows.find(r => r.table === 'bookmarks')!;
  expect(row.importedFavicon).toBe(true);
  const category = state.rows.find(r => r.table === 'categories' && r.userId === 'mine')!;
  const { categories } = store.denormalize([{ _id: category._id, name: 'New', order: 1 }],
    [{ ...row, categoryId: category._id, order: 1, title: 'New link', url: backup[0].bookmarks[0].url }], []);
  const [saved] = parseJSON(JSON.stringify(categories)).categories[0].bookmarks;
  expect(saved.importedFavicon).toBe(true);
  await store.updateBookmark(saved.id, 'Renamed', saved.url, saved.iconPath);
  expect(state.rows.find(r => r._id === saved.id)).toMatchObject({ title: 'Renamed', importedFavicon: true });
  // An explicit manual selection of the very same bytes takes precedence.
  await store.updateBookmark(saved.id, 'Uploaded', saved.url, saved.iconPath, undefined, false);
  expect(state.rows.find(r => r._id === saved.id)?.importedFavicon).toBeUndefined();
});

it('recognizes explicit transport size rejections and keeps validation, authentication and uncertain network failures distinct', () => {
  for (const failure of [
    { status: 413 }, new Error('413 Request Entity Too Large'),
    new Error('[CONVEX M(bookmarks:importBulk)] Arguments for bookmarks.js:importBulk are too large (actual: 18 MiB, limit: 16 MiB)'),
    new ConvexError(IMPORT_CAPACITY),
  ]) expect(isImportCapacityError(failure)).toBe(true);
  for (const failure of [
    new Error('Server Error'), new Error('Failed to fetch'), new Error('Not authenticated'),
    new Error('Import exceeds maximum of 5000 bookmarks'), new ConvexError('Forbidden'),
    new Error('Too many writes in a single function execution (limit: 16000)'),
  ]) expect(isImportCapacityError(failure)).toBe(false);
});

it('validates the bounded replacement before touching old rows, then replaces only the signed-in library', async () => {
  const state = mockDatabase(false);
  const store = await import('../../src/data/store');
  store.activateConvex();
  await expect(store.importBulk(Array(501).fill(backup[0]), true)).rejects.toThrow('500 categories');
  expect(state.deletes).toBe(0);
  expect(state.rows).toEqual(originalRows);
  await store.importBulk(backup, true);
  expect(state.rows.filter(row => row.userId === 'mine').map(row => row.table))
    .toEqual(['categories', 'bookmarks', 'syncWatermarks']);
  expect(state.rows).toContainEqual(originalRows[3]);
});

it('keeps older append-only callers compatible when the mutation omits replace', async () => {
  const state = mockDatabase(false);
  await client.mutation(api.bookmarks.importBulk, { data: backup });
  expect(state.deletes).toBe(0);
  expect(state.rows).toEqual(expect.arrayContaining(originalRows));
});
