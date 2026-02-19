import { describe, it, expect } from 'vitest';

// NOTE: computeMidpoint is currently a private (non-exported) function inside
// src/features/drag-drop.ts. It needs to be exported before these tests will
// compile. That export change will be done separately.
import { computeMidpoint } from '../../src/features/drag-drop';

describe('computeMidpoint', () => {
  it('insert at start of empty array returns 0.5 (midpoint of 0 and 1)', () => {
    // bookmarks = [], targetIndex = 0
    // prev = 0 (targetIndex is 0, so prev defaults to 0)
    // next = 1 (bookmarks.length is 0, so fallback to 1)
    // midpoint = (0 + 1) / 2 = 0.5
    expect(computeMidpoint([], 0)).toBe(0.5);
  });

  it('insert at start of non-empty array returns midpoint between 0 and first order', () => {
    const bookmarks = [{ order: 2 }, { order: 4 }, { order: 6 }];
    // targetIndex = 0
    // prev = 0 (targetIndex is 0)
    // next = bookmarks[0].order = 2
    // midpoint = (0 + 2) / 2 = 1
    expect(computeMidpoint(bookmarks, 0)).toBe(1);
  });

  it('insert at end returns midpoint between last order and last+1', () => {
    const bookmarks = [{ order: 2 }, { order: 4 }, { order: 6 }];
    // targetIndex = 3 (bookmarks.length)
    // prev = bookmarks[2].order = 6
    // next = bookmarks[2].order + 1 = 7 (targetIndex >= length, last + 1)
    // midpoint = (6 + 7) / 2 = 6.5
    expect(computeMidpoint(bookmarks, 3)).toBe(6.5);
  });

  it('insert between two items returns midpoint of their orders', () => {
    const bookmarks = [{ order: 2 }, { order: 8 }];
    // targetIndex = 1
    // prev = bookmarks[0].order = 2
    // next = bookmarks[1].order = 8
    // midpoint = (2 + 8) / 2 = 5
    expect(computeMidpoint(bookmarks, 1)).toBe(5);
  });

  it('items with undefined order use index as fallback', () => {
    const bookmarks = [{}, {}, {}] as { order?: number }[];
    // targetIndex = 1
    // prev = bookmarks[0].order ?? 0 = 0
    // next = bookmarks[1].order ?? 1 = 1
    // midpoint = (0 + 1) / 2 = 0.5
    expect(computeMidpoint(bookmarks, 1)).toBe(0.5);
  });

  it('handles single-item array with insert at start', () => {
    const bookmarks = [{ order: 5 }];
    // targetIndex = 0
    // prev = 0
    // next = bookmarks[0].order = 5
    // midpoint = (0 + 5) / 2 = 2.5
    expect(computeMidpoint(bookmarks, 0)).toBe(2.5);
  });

  it('handles single-item array with insert at end', () => {
    const bookmarks = [{ order: 5 }];
    // targetIndex = 1 (bookmarks.length)
    // prev = bookmarks[0].order = 5
    // next = bookmarks[0].order + 1 = 6
    // midpoint = (5 + 6) / 2 = 5.5
    expect(computeMidpoint(bookmarks, 1)).toBe(5.5);
  });

  it('produces values that maintain correct relative ordering', () => {
    // Simulate successive insertions — each midpoint should land between its neighbors
    const bookmarks = [{ order: 0 }, { order: 10 }];
    const mid = computeMidpoint(bookmarks, 1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(10);

    // Insert between 0 and mid
    const bookmarksAfter = [{ order: 0 }, { order: mid }, { order: 10 }];
    const mid2 = computeMidpoint(bookmarksAfter, 1);
    expect(mid2).toBeGreaterThan(0);
    expect(mid2).toBeLessThan(mid);
  });
});
