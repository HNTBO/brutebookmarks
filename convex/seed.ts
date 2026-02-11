import { mutation } from './_generated/server';
import { v } from 'convex/values';

export const seedDefaults = mutation({
  args: {
    items: v.array(
      v.object({
        type: v.union(v.literal('group'), v.literal('standalone')),
        name: v.string(),
        order: v.float64(),
        categories: v.array(
          v.object({
            name: v.string(),
            order: v.float64(),
            bookmarks: v.array(
              v.object({
                title: v.string(),
                url: v.string(),
                order: v.float64(),
              }),
            ),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    // Guard: only seed if user has no data
    const existing = await ctx.db
      .query('categories')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .first();
    if (existing) return;

    for (const item of items) {
      if (item.type === 'group') {
        const groupId = await ctx.db.insert('tabGroups', {
          name: item.name,
          order: item.order,
          userId,
        });

        for (const cat of item.categories) {
          const categoryId = await ctx.db.insert('categories', {
            name: cat.name,
            order: cat.order,
            userId,
            groupId,
          });

          for (const bk of cat.bookmarks) {
            await ctx.db.insert('bookmarks', {
              title: bk.title,
              url: bk.url,
              categoryId,
              order: bk.order,
              userId,
            });
          }
        }
      } else {
        // standalone — single category, no group
        const cat = item.categories[0];
        if (!cat) continue;

        const categoryId = await ctx.db.insert('categories', {
          name: cat.name,
          order: item.order,
          userId,
        });

        for (const bk of cat.bookmarks) {
          await ctx.db.insert('bookmarks', {
            title: bk.title,
            url: bk.url,
            categoryId,
            order: bk.order,
            userId,
          });
        }
      }
    }
  },
});
