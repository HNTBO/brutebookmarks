import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const userId = identity.subject;
    return await ctx.db
      .query('tabGroups')
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
      .query('tabGroups')
      .withIndex('by_user_order', (q) => q.eq('userId', userId))
      .collect();
    const maxOrder = existing.reduce((max, g) => Math.max(max, g.order), 0);

    return await ctx.db.insert('tabGroups', {
      name,
      order: maxOrder + 1,
      userId,
    });
  },
});

export const update = mutation({
  args: { id: v.id('tabGroups'), name: v.string() },
  handler: async (ctx, { id, name }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const group = await ctx.db.get(id);
    if (!group || group.userId !== identity.subject) {
      throw new Error('Tab group not found');
    }
    await ctx.db.patch(id, { name });
  },
});

export const remove = mutation({
  args: { id: v.id('tabGroups') },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const group = await ctx.db.get(id);
    if (!group || group.userId !== identity.subject) {
      throw new Error('Tab group not found');
    }

    // Ungroup all categories in this group
    const categories = await ctx.db
      .query('categories')
      .withIndex('by_user', (q) => q.eq('userId', identity.subject))
      .collect();
    for (const cat of categories) {
      if (cat.groupId === id) {
        await ctx.db.patch(cat._id, { groupId: undefined });
      }
    }

    await ctx.db.delete(id);
  },
});

export const reorder = mutation({
  args: { id: v.id('tabGroups'), order: v.float64() },
  handler: async (ctx, { id, order }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const group = await ctx.db.get(id);
    if (!group || group.userId !== identity.subject) {
      throw new Error('Tab group not found');
    }
    await ctx.db.patch(id, { order });
  },
});

export const createWithCategories = mutation({
  args: {
    name: v.string(),
    categoryIds: v.array(v.id('categories')),
  },
  handler: async (ctx, { name, categoryIds }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    // Compute order: use the minimum order of the categories being grouped
    // so the group appears at the same position
    let groupOrder = 0;
    for (const catId of categoryIds) {
      const cat = await ctx.db.get(catId);
      if (!cat || cat.userId !== userId) {
        throw new Error('Category not found');
      }
      if (groupOrder === 0 || cat.order < groupOrder) {
        groupOrder = cat.order;
      }
    }

    const groupId = await ctx.db.insert('tabGroups', {
      name,
      order: groupOrder,
      userId,
    });

    // Assign categories to the group with tab ordering
    for (let i = 0; i < categoryIds.length; i++) {
      await ctx.db.patch(categoryIds[i], { groupId, order: i + 1 });
    }

    return groupId;
  },
});
