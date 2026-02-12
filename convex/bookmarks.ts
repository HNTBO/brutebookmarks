import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const listAll = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    return await ctx.db
      .query('bookmarks')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    categoryId: v.id('categories'),
    title: v.string(),
    url: v.string(),
    iconPath: v.optional(v.string()),
  },
  handler: async (ctx, { categoryId, title, url, iconPath }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    // Verify category ownership
    const category = await ctx.db.get(categoryId);
    if (!category || category.userId !== userId) {
      throw new Error('Category not found');
    }

    // Find max order among siblings
    const siblings = await ctx.db
      .query('bookmarks')
      .withIndex('by_category_order', (q) => q.eq('categoryId', categoryId))
      .collect();
    const maxOrder = siblings.reduce((max, b) => Math.max(max, b.order), 0);

    return await ctx.db.insert('bookmarks', {
      title,
      url,
      iconPath: iconPath ?? undefined,
      categoryId,
      order: maxOrder + 1,
      userId,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id('bookmarks'),
    title: v.string(),
    url: v.string(),
    iconPath: v.optional(v.string()),
  },
  handler: async (ctx, { id, title, url, iconPath }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const bookmark = await ctx.db.get(id);
    if (!bookmark || bookmark.userId !== identity.subject) {
      throw new Error('Bookmark not found');
    }
    await ctx.db.patch(id, { title, url, iconPath: iconPath ?? undefined });
  },
});

export const remove = mutation({
  args: { id: v.id('bookmarks') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const bookmark = await ctx.db.get(id);
    if (!bookmark || bookmark.userId !== identity.subject) {
      throw new Error('Bookmark not found');
    }
    await ctx.db.delete(id);
  },
});

export const reorder = mutation({
  args: {
    id: v.id('bookmarks'),
    order: v.float64(),
    categoryId: v.optional(v.id('categories')),
  },
  handler: async (ctx, { id, order, categoryId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    const bookmark = await ctx.db.get(id);
    if (!bookmark || bookmark.userId !== userId) {
      throw new Error('Bookmark not found');
    }

    const patch: { order: number; categoryId?: typeof categoryId } = { order };
    if (categoryId !== undefined) {
      // Verify target category ownership
      const targetCategory = await ctx.db.get(categoryId);
      if (!targetCategory || targetCategory.userId !== userId) {
        throw new Error('Target category not found');
      }
      patch.categoryId = categoryId;
    }
    await ctx.db.patch(id, patch);
  },
});

export const importBulk = mutation({
  args: {
    data: v.array(
      v.object({
        name: v.string(),
        bookmarks: v.array(
          v.object({
            title: v.string(),
            url: v.string(),
            iconPath: v.optional(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, { data }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    for (let ci = 0; ci < data.length; ci++) {
      const cat = data[ci];
      const categoryId = await ctx.db.insert('categories', {
        name: cat.name,
        order: ci + 1,
        userId,
      });
      for (let bi = 0; bi < cat.bookmarks.length; bi++) {
        const bk = cat.bookmarks[bi];
        await ctx.db.insert('bookmarks', {
          title: bk.title,
          url: bk.url,
          iconPath: bk.iconPath ?? undefined,
          categoryId,
          order: bi + 1,
          userId,
        });
      }
    }
  },
});

export const eraseAll = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    const bookmarks = await ctx.db
      .query('bookmarks')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const b of bookmarks) {
      await ctx.db.delete(b._id);
    }

    const categories = await ctx.db
      .query('categories')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const c of categories) {
      await ctx.db.delete(c._id);
    }

    const tabGroups = await ctx.db
      .query('tabGroups')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    for (const g of tabGroups) {
      await ctx.db.delete(g._id);
    }
  },
});
