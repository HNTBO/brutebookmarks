import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

const MAX_NAME_LENGTH = 200;

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
  args: { name: v.string(), groupId: v.optional(v.id('tabGroups')) },
  handler: async (ctx, { name, groupId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    if (name.length > MAX_NAME_LENGTH) throw new Error('Category name too long');
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
      groupId,
    });
  },
});

export const update = mutation({
  args: { id: v.id('categories'), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    if (name.length > MAX_NAME_LENGTH) throw new Error('Category name too long');

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

export const setGroup = mutation({
  args: {
    id: v.id('categories'),
    groupId: v.optional(v.id('tabGroups')),
    order: v.optional(v.float64()),
  },
  handler: async (ctx, { id, groupId, order }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const category = await ctx.db.get(id);
    if (!category || category.userId !== identity.subject) {
      throw new Error('Category not found');
    }

    if (groupId) {
      // Assigning to a group: compute order as last tab in that group
      const siblings = await ctx.db
        .query('categories')
        .withIndex('by_user', (q) => q.eq('userId', identity.subject))
        .collect();
      const inGroup = siblings.filter((c) => c.groupId === groupId);
      const maxOrder = inGroup.reduce((max, c) => Math.max(max, c.order), 0);
      await ctx.db.patch(id, { groupId, order: maxOrder + 1 });
    } else {
      // Ungrouping: use provided order or fall back to end of list
      if (order !== undefined) {
        await ctx.db.patch(id, { groupId: undefined, order });
      } else {
        const allCats = await ctx.db
          .query('categories')
          .withIndex('by_user_order', (q) => q.eq('userId', identity.subject))
          .collect();
        const maxOrder = allCats.reduce((max, c) => Math.max(max, c.order), 0);
        await ctx.db.patch(id, { groupId: undefined, order: maxOrder + 1 });
      }
    }
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
