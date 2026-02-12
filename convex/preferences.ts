import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

const FOUNDING_MEMBER_CAP = 1000;

export const getFoundingMemberStats = query({
  handler: async (ctx) => {
    const allPrefs = await ctx.db.query('userPreferences').collect();
    const count = allPrefs.filter((p) => p.foundingMemberSince !== undefined).length;
    return { count, cap: FOUNDING_MEMBER_CAP };
  },
});

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
    autofillUrl: v.optional(v.boolean()),
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
      theme: args.theme,
      accentColorDark: args.accentColorDark,
      accentColorLight: args.accentColorLight,
      cardSize: args.cardSize,
      pageWidth: args.pageWidth,
      showCardNames: args.showCardNames,
      autofillUrl: args.autofillUrl,
      userId,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      // Check if founding member slots are available
      const allPrefs = await ctx.db.query('userPreferences').collect();
      const foundingCount = allPrefs.filter((p) => p.foundingMemberSince !== undefined).length;

      await ctx.db.insert('userPreferences', {
        ...data,
        ...(foundingCount < FOUNDING_MEMBER_CAP ? { foundingMemberSince: Date.now() } : {}),
      });
    }
  },
});
