import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
import { api } from '../../convex/_generated/api';
import { importBulk as importMutation } from '../../convex/bookmarks';
import { parseJSON } from '../../src/utils/bookmark-parsers';

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
  await store.importBulk([...legacy, ...backup], true);
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

type Row = { _id: string; table: string; userId: string; name?: string; title?: string };
type Data = { name: string; bookmarks: { title: string; url: string }[] }[];
const originalRows: Row[] = [
  { _id: 'old', table: 'categories', userId: 'mine', name: 'Old' },
  { _id: 'link', table: 'bookmarks', userId: 'mine', title: 'Old link' },
  { _id: 'group', table: 'tabGroups', userId: 'mine' },
  { _id: 'other', table: 'categories', userId: 'someone-else' },
];

// Each client mutation gets its own transaction. The fixture publishes its
// staged rows only after the real registered handler finishes successfully.
function mockDatabase(failInsert: boolean) {
  const state = { rows: structuredClone(originalRows), deletes: 0 };
  client.mutation.mockImplementation(async (ref, args: { data: Data; replace?: boolean }) => {
    expect(getFunctionName(ref)).toBe('bookmarks:importBulk');
    const rows = structuredClone(state.rows);
    const ctx = {
      auth: { getUserIdentity: async () => ({ subject: 'mine' }) },
      db: {
        query: (table: string) => ({
          withIndex: (index: string, select: (q: { eq: (field: string, user: string) => string }) => string) => {
            expect(index).toBe('by_user');
            const user = select({ eq: (field, value) => { expect(field).toBe('userId'); return value; } });
            const matches = rows.filter(row => row.table === table && row.userId === user);
            return { collect: async () => matches, first: async () => matches[0] ?? null };
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
          const id = 'generated-' + rows.length;
          rows.push({ ...fields, table, _id: id });
          return id;
        },
      },
    };
    const registered = importMutation as typeof importMutation & {
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
