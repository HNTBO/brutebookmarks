import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

export const get = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;
    return await ctx.db
      .query('userPreferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
  },
});

export const set = mutation({
  args: {
    theme: v.string(),
    accentColorDark: v.optional(v.string()),
    accentColorLight: v.optional(v.string()),
    cardSize: v.float64(),
    pageWidth: v.float64(),
    showCardNames: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    const existing = await ctx.db
      .query('userPreferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();

    const data = {
      ...args,
      userId,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert('userPreferences', data);
    }
  },
});
