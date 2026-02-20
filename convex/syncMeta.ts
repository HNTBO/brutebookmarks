import { query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildSnapshotDigest(
  categories: Array<{ _id: string; name: string; order: number; groupId?: string | null }>,
  bookmarks: Array<{ _id: string; categoryId: string; title: string; url: string; iconPath?: string | null; order: number }>,
  tabGroups: Array<{ _id: string; name: string; order: number }>,
): string {
  const catParts = [...categories]
    .sort((a, b) => a.order - b.order || a._id.localeCompare(b._id))
    .map((c) => `${c._id}|${c.name}|${c.order}|${c.groupId ?? ''}`);

  const bookmarkParts = [...bookmarks]
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order || a._id.localeCompare(b._id))
    .map((b) => `${b._id}|${b.categoryId}|${b.title}|${b.url}|${b.iconPath ?? ''}|${b.order}`);

  const groupParts = [...tabGroups]
    .sort((a, b) => a.order - b.order || a._id.localeCompare(b._id))
    .map((g) => `${g._id}|${g.name}|${g.order}`);

  return fnv1a32(`${catParts.join('~')}#${bookmarkParts.join('~')}#${groupParts.join('~')}`);
}

async function readWatermark(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query('syncWatermarks')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .first();
}

/**
 * Increment the per-user sync watermark whenever bookmark/category/tab-group data changes.
 * This makes startup freshness checks O(1) for normal runtime.
 */
export async function bumpUserWatermark(ctx: MutationCtx, userId: string): Promise<void> {
  const now = Date.now();
  const watermark = await readWatermark(ctx, userId);
  if (watermark) {
    await ctx.db.patch(watermark._id, {
      revision: watermark.revision + 1,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert('syncWatermarks', {
    userId,
    revision: 1,
    updatedAt: now,
  });
}

export const getWatermark = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;

    const watermark = await readWatermark(ctx, userId);
    if (watermark) {
      return {
        source: 'watermark' as const,
        revision: watermark.revision,
        updatedAt: watermark.updatedAt,
      };
    }

    // Legacy fallback for users without syncWatermarks row yet:
    // compute a digest from current server state so startup can still
    // validate local snapshot freshness without writing anything.
    const [categories, bookmarks, tabGroups] = await Promise.all([
      ctx.db.query('categories').withIndex('by_user', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('bookmarks').withIndex('by_user', (q) => q.eq('userId', userId)).collect(),
      ctx.db.query('tabGroups').withIndex('by_user', (q) => q.eq('userId', userId)).collect(),
    ]);

    return {
      source: 'legacyDigest' as const,
      digest: buildSnapshotDigest(categories, bookmarks, tabGroups),
      revision: 0,
      updatedAt: 0,
    };
  },
});
