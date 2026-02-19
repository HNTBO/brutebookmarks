import { query, mutation } from './_generated/server';
import { v } from 'convex/values';

const MAX_TITLE_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const MAX_NAME_LENGTH = 200;
const MAX_ICON_PATH_LENGTH = 2048;

function validateUrl(url: string): void {
  if (url.length > MAX_URL_LENGTH) {
    throw new Error(`URL exceeds maximum length of ${MAX_URL_LENGTH}`);
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`Invalid URL scheme: ${parsed.protocol} — only http and https are allowed`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Invalid URL scheme')) throw e;
    throw new Error('Invalid URL format');
  }
}

function validateIconPath(iconPath: string): void {
  if (iconPath.length > MAX_ICON_PATH_LENGTH) {
    throw new Error('Icon path exceeds maximum length');
  }
  if (
    !iconPath.startsWith('data:') &&
    !iconPath.startsWith('http://') &&
    !iconPath.startsWith('https://')
  ) {
    throw new Error('Invalid icon path: must be http, https, or data URI');
  }
}

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

    if (title.length > MAX_TITLE_LENGTH) throw new Error('Title too long');
    validateUrl(url);
    if (iconPath) validateIconPath(iconPath);

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
    categoryId: v.optional(v.id('categories')),
  },
  handler: async (ctx, { id, title, url, iconPath, categoryId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const userId = identity.subject;

    if (title.length > MAX_TITLE_LENGTH) throw new Error('Title too long');
    validateUrl(url);
    if (iconPath) validateIconPath(iconPath);

    const bookmark = await ctx.db.get(id);
    if (!bookmark || bookmark.userId !== userId) {
      throw new Error('Bookmark not found');
    }

    const patch: Record<string, unknown> = { title, url, iconPath: iconPath ?? undefined };

    if (categoryId !== undefined && categoryId !== bookmark.categoryId) {
      const targetCategory = await ctx.db.get(categoryId);
      if (!targetCategory || targetCategory.userId !== userId) {
        throw new Error('Target category not found');
      }
      // Place at end of target category
      const siblings = await ctx.db
        .query('bookmarks')
        .withIndex('by_category_order', (q) => q.eq('categoryId', categoryId))
        .collect();
      const maxOrder = siblings.reduce((max, b) => Math.max(max, b.order), 0);
      patch.categoryId = categoryId;
      patch.order = maxOrder + 1;
    }

    await ctx.db.patch(id, patch);
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

    // Enforce import limits
    if (data.length > 500) {
      throw new Error(`Import exceeds maximum of 500 categories (got ${data.length})`);
    }
    const totalBookmarks = data.reduce((sum, cat) => sum + cat.bookmarks.length, 0);
    if (totalBookmarks > 5000) {
      throw new Error(`Import exceeds maximum of 5000 bookmarks (got ${totalBookmarks})`);
    }

    // Validate all fields before inserting anything
    for (const cat of data) {
      if (cat.name.length > MAX_NAME_LENGTH) throw new Error('Category name too long');
      for (const bk of cat.bookmarks) {
        if (bk.title.length > MAX_TITLE_LENGTH) throw new Error('Bookmark title too long');
        validateUrl(bk.url);
        if (bk.iconPath) validateIconPath(bk.iconPath);
      }
    }

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
