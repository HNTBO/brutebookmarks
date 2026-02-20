import { query, mutation } from './_generated/server';
import { v } from 'convex/values';
import { bumpUserWatermark } from './syncMeta';

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

    const groupId = await ctx.db.insert('tabGroups', {
      name,
      order: maxOrder + 1,
      userId,
    });
    await bumpUserWatermark(ctx, userId);
    return groupId;
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
    await bumpUserWatermark(ctx, identity.subject);
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
    await bumpUserWatermark(ctx, identity.subject);
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
    await bumpUserWatermark(ctx, identity.subject);
  },
});

export const mergeInto = mutation({
  args: {
    sourceId: v.id('tabGroups'),
    targetId: v.id('tabGroups'),
  },
  handler: async (ctx, { sourceId, targetId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    const source = await ctx.db.get(sourceId);
    const target = await ctx.db.get(targetId);
    if (!source || source.userId !== userId) throw new Error('Source group not found');
    if (!target || target.userId !== userId) throw new Error('Target group not found');

    // Find all categories in the target group to compute max order
    const allCats = await ctx.db
      .query('categories')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const targetCats = allCats.filter((c) => c.groupId === targetId);
    let maxOrder = targetCats.reduce((max, c) => Math.max(max, c.order), 0);

    // Move source categories into target group
    const sourceCats = allCats.filter((c) => c.groupId === sourceId);
    for (const cat of sourceCats) {
      maxOrder += 1;
      await ctx.db.patch(cat._id, { groupId: targetId, order: maxOrder });
    }

    // Delete the now-empty source group
    await ctx.db.delete(sourceId);
    await bumpUserWatermark(ctx, userId);
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

    await bumpUserWatermark(ctx, userId);
    return groupId;
  },
});
