import { expect, it, vi } from 'vitest';
import { replaceIcon } from '../../convex/bookmarks';

const url = 'https://fixture.example/';
const embedded = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
const discovered = url + 'icon.png';

it.each([
  { name: 'an older record without an icon', old: {}, expected: { iconPath: null }, applied: true },
  { name: 'a renamed bookmark with its original imported icon', old: { iconPath: embedded, importedFavicon: true }, expected: { iconPath: embedded, importedFavicon: true }, applied: true },
  { name: 'a manual upload with the same bytes as the imported icon', old: { iconPath: embedded }, expected: { iconPath: embedded, importedFavicon: true }, applied: false },
  { name: 'a changed URL', old: { url: url + 'changed' }, expected: { iconPath: null }, applied: false },
  { name: 'a custom icon saved after creation', old: { iconPath: embedded }, expected: { iconPath: null }, applied: false },
  { name: 'a bookmark owned by someone else', old: { userId: 'other' }, expected: { iconPath: null }, applied: false },
])('compares the current synced state for $name', async ({ old, expected, applied }) => {
  const ctx = {
    auth: { getUserIdentity: async () => ({ subject: 'fixture' }) },
    db: {
      get: async () => ({ title: 'Latest title', url, userId: 'fixture', ...old }),
      patch: vi.fn(),
      query: () => ({ withIndex: () => ({ first: async () => ({ _id: 'watermark', revision: 1 }) }) }),
    },
  };
  const args = { id: 'bookmark', expected: { url, ...expected }, iconPath: discovered };
  const mutation = replaceIcon as typeof replaceIcon & {
    _handler(context: typeof ctx, input: typeof args): Promise<boolean>;
  };
  expect(await mutation._handler(ctx, args)).toBe(applied);
  if (applied) {
    expect(ctx.db.patch.mock.calls[0]).toEqual(['bookmark', { iconPath: discovered, importedFavicon: undefined }]);
    expect(ctx.db.patch.mock.calls[1]).toEqual(['watermark', expect.objectContaining({ revision: 2 })]);
  } else {
    expect(ctx.db.patch).not.toHaveBeenCalled();
  }
});
