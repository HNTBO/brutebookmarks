import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    return await ctx.db
      .query('categories')
      .withIndex('by_user_order', (q) => q.eq('userId', userId))
      .collect();
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    const existing = await ctx.db
      .query('categories')
      .withIndex('by_user_order', (q) => q.eq('userId', userId))
      .collect();
    const maxOrder = existing.reduce((max, c) => Math.max(max, c.order), 0);

    return await ctx.db.insert('categories', {
      name,
      order: maxOrder + 1,
      userId,
    });
  },
});

export const update = mutation({
  args: { id: v.id('categories'), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const category = await ctx.db.get(id);
    if (!category || category.userId !== identity.subject) {
      throw new Error('Category not found');
    }
    await ctx.db.patch(id, { name });
  },
});

export const remove = mutation({
  args: { id: v.id('categories') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const category = await ctx.db.get(id);
    if (!category || category.userId !== identity.subject) {
      throw new Error('Category not found');
    }

    // Cascade-delete bookmarks in this category
    const bookmarks = await ctx.db
      .query('bookmarks')
      .withIndex('by_category', (q) => q.eq('categoryId', id))
      .collect();
    for (const b of bookmarks) {
      await ctx.db.delete(b._id);
    }

    await ctx.db.delete(id);
  },
});

export const reorder = mutation({
  args: { id: v.id('categories'), order: v.float64() },
  handler: async (ctx, { id, order }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const category = await ctx.db.get(id);
    if (!category || category.userId !== identity.subject) {
      throw new Error('Category not found');
    }
    await ctx.db.patch(id, { order });
  },
});
