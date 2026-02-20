import { describe, it, expect } from 'vitest';
import { buildSnapshotDigest, shouldRenderSnapshotCache } from '../../src/utils/snapshot-watermark';
import type { Category } from '../../src/types';

function makeCategory(id: string, name: string, order: number, bookmarks: Array<{ id: string; title: string; url: string; order: number }>): Category {
  return {
    id,
    name,
    order,
    bookmarks: bookmarks.map((b) => ({
      id: b.id,
      title: b.title,
      url: b.url,
      order: b.order,
      iconPath: null,
    })),
  };
}

describe('snapshot-watermark', () => {
  it('buildSnapshotDigest is stable regardless of input array order', () => {
    const categoriesA = [
      makeCategory('c2', 'Work', 2, [{ id: 'b2', title: 'GitHub', url: 'https://github.com', order: 2 }]),
      makeCategory('c1', 'Tools', 1, [{ id: 'b1', title: 'Docs', url: 'https://docs.example.com', order: 1 }]),
    ];
    const categoriesB = [...categoriesA].reverse();

    const groupsA = [{ id: 'g1', name: 'Main', order: 1 }];
    const groupsB = [...groupsA].reverse();

    expect(buildSnapshotDigest(categoriesA, groupsA)).toBe(buildSnapshotDigest(categoriesB, groupsB));
  });

  it('buildSnapshotDigest changes when snapshot content changes', () => {
    const categories = [makeCategory('c1', 'Tools', 1, [{ id: 'b1', title: 'Docs', url: 'https://docs.example.com', order: 1 }])];
    const digest1 = buildSnapshotDigest(categories, []);
    const digest2 = buildSnapshotDigest(
      [makeCategory('c1', 'Tools', 1, [{ id: 'b1', title: 'Docs', url: 'https://docs.changed.com', order: 1 }])],
      [],
    );

    expect(digest1).not.toBe(digest2);
  });

  it('shouldRenderSnapshotCache uses revision matching when watermark source is authoritative', () => {
    const meta = {
      version: 1 as const,
      cachedAt: 1,
      snapshotDigest: 'abc123',
      watermarkRevision: 42,
    };

    expect(
      shouldRenderSnapshotCache(meta, {
        source: 'watermark',
        revision: 42,
        updatedAt: 10,
      }),
    ).toBe(true);

    expect(
      shouldRenderSnapshotCache(meta, {
        source: 'watermark',
        revision: 43,
        updatedAt: 10,
      }),
    ).toBe(false);
  });

  it('shouldRenderSnapshotCache falls back to digest matching for legacy users', () => {
    const meta = {
      version: 1 as const,
      cachedAt: 1,
      snapshotDigest: 'digest-a',
    };

    expect(
      shouldRenderSnapshotCache(meta, {
        source: 'legacyDigest',
        digest: 'digest-a',
        revision: 0,
        updatedAt: 0,
      }),
    ).toBe(true);

    expect(
      shouldRenderSnapshotCache(meta, {
        source: 'legacyDigest',
        digest: 'digest-b',
        revision: 0,
        updatedAt: 0,
      }),
    ).toBe(false);
  });
});
