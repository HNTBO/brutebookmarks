import { describe, it, expect } from 'vitest';
import { denormalize } from '../../src/data/store';

// --- Helpers ---

function cat(id: string, name: string, order: number, groupId?: string | null) {
  return { _id: id, name, order, groupId: groupId ?? undefined };
}
function bm(id: string, title: string, url: string, order: number, categoryId: string) {
  return { _id: id, title, url, iconPath: null, order, categoryId };
}
function tg(id: string, name: string, order: number) {
  return { _id: id, name, order };
}

// --- Tests ---

describe('denormalize', () => {
  it('returns empty arrays for empty input', () => {
    const result = denormalize([], [], []);
    expect(result.categories).toEqual([]);
    expect(result.layoutItems).toEqual([]);
    expect(result.tabGroups).toEqual([]);
  });

  it('maps _id to id and sorts categories by order', () => {
    const cats = [cat('c2', 'Second', 2), cat('c1', 'First', 1)];
    const result = denormalize(cats, [], []);
    expect(result.categories.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(result.categories[0].name).toBe('First');
  });

  it('nests bookmarks under their category, sorted by order', () => {
    const cats = [cat('c1', 'Cat', 1)];
    const bms = [
      bm('b2', 'Second', 'https://b.com', 2, 'c1'),
      bm('b1', 'First', 'https://a.com', 1, 'c1'),
    ];
    const result = denormalize(cats, bms, []);
    expect(result.categories[0].bookmarks).toHaveLength(2);
    expect(result.categories[0].bookmarks[0].id).toBe('b1');
    expect(result.categories[0].bookmarks[1].id).toBe('b2');
  });

  it('categories with no bookmarks have empty bookmark arrays', () => {
    const cats = [cat('c1', 'Empty', 1)];
    const result = denormalize(cats, [], []);
    expect(result.categories[0].bookmarks).toEqual([]);
  });

  it('orphan bookmarks (no matching category) are ignored', () => {
    const cats = [cat('c1', 'Cat', 1)];
    const bms = [bm('b1', 'Orphan', 'https://x.com', 1, 'missing')];
    const result = denormalize(cats, bms, []);
    expect(result.categories[0].bookmarks).toEqual([]);
  });

  it('ungrouped categories become layout items of type "category"', () => {
    const cats = [cat('c1', 'A', 1), cat('c2', 'B', 2)];
    const result = denormalize(cats, [], []);
    expect(result.layoutItems).toHaveLength(2);
    expect(result.layoutItems[0].type).toBe('category');
    if (result.layoutItems[0].type === 'category') {
      expect(result.layoutItems[0].category.id).toBe('c1');
    }
  });

  it('grouped categories are nested under their tab group in layout', () => {
    const cats = [
      cat('c1', 'Tab A', 1, 'g1'),
      cat('c2', 'Tab B', 2, 'g1'),
      cat('c3', 'Standalone', 3),
    ];
    const groups = [tg('g1', 'Group One', 2)];
    const result = denormalize(cats, [], groups);

    // 2 layout items: standalone category + tab group
    expect(result.layoutItems).toHaveLength(2);

    const standalone = result.layoutItems.find((i) => i.type === 'category');
    const grouped = result.layoutItems.find((i) => i.type === 'tabGroup');
    expect(standalone).toBeDefined();
    expect(grouped).toBeDefined();

    if (grouped?.type === 'tabGroup') {
      expect(grouped.group.categories).toHaveLength(2);
      expect(grouped.group.categories[0].id).toBe('c1');
      expect(grouped.group.categories[1].id).toBe('c2');
    }
  });

  it('layout items are sorted by order across types', () => {
    const cats = [
      cat('c1', 'Early', 1),
      cat('c2', 'In Group', 3, 'g1'),
      cat('c3', 'Late', 5),
    ];
    const groups = [tg('g1', 'Mid Group', 3)];
    const result = denormalize(cats, [], groups);

    expect(result.layoutItems).toHaveLength(3);
    // Order should be: c1 (1), g1 (3), c3 (5)
    expect(result.layoutItems[0].type).toBe('category');
    expect(result.layoutItems[1].type).toBe('tabGroup');
    expect(result.layoutItems[2].type).toBe('category');
  });

  it('empty tab groups (no categories assigned) are excluded from layout', () => {
    const cats = [cat('c1', 'Standalone', 1)];
    const groups = [tg('g1', 'Empty Group', 2)];
    const result = denormalize(cats, [], groups);

    expect(result.layoutItems).toHaveLength(1);
    expect(result.layoutItems[0].type).toBe('category');
    // But tabGroups array still includes the empty group
    expect(result.tabGroups).toHaveLength(1);
  });

  it('tabGroups array is sorted by order', () => {
    const groups = [tg('g2', 'Second', 2), tg('g1', 'First', 1)];
    const result = denormalize([], [], groups);
    expect(result.tabGroups[0].id).toBe('g1');
    expect(result.tabGroups[1].id).toBe('g2');
  });

  it('converts iconPath null/undefined properly', () => {
    const cats = [cat('c1', 'Cat', 1)];
    const bms = [
      { _id: 'b1', title: 'A', url: 'https://a.com', iconPath: null, order: 1, categoryId: 'c1' },
      { _id: 'b2', title: 'B', url: 'https://b.com', iconPath: '/icon.png', order: 2, categoryId: 'c1' },
    ];
    const result = denormalize(cats, bms, []);
    expect(result.categories[0].bookmarks[0].iconPath).toBeNull();
    expect(result.categories[0].bookmarks[1].iconPath).toBe('/icon.png');
  });

  it('converts groupId null to undefined on output categories', () => {
    const cats = [cat('c1', 'A', 1, null)];
    const result = denormalize(cats, [], []);
    expect(result.categories[0].groupId).toBeUndefined();
  });

  it('categories with invalid groupId become ungrouped', () => {
    const cats = [cat('c1', 'A', 1, 'nonexistent')];
    const result = denormalize(cats, [], []);
    expect(result.layoutItems).toHaveLength(1);
    expect(result.layoutItems[0].type).toBe('category');
  });
});
