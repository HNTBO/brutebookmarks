import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// --- Internal query/mutation for cache access from actions ---

export const getCachedFavicon = internalQuery({
  args: { domain: v.string() },
  handler: async (ctx, { domain }) => {
    return await ctx.db
      .query("faviconCache")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .first();
  },
});

export const upsertFaviconCache = internalMutation({
  args: {
    domain: v.string(),
    iconUrl: v.string(),
    source: v.string(),
    fetchedAt: v.float64(),
  },
  handler: async (ctx, { domain, iconUrl, source, fetchedAt }) => {
    const existing = await ctx.db
      .query("faviconCache")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { iconUrl, source, fetchedAt });
    } else {
      await ctx.db.insert("faviconCache", { domain, iconUrl, source, fetchedAt });
    }
  },
});

// --- Public query (no auth, read-only cache access for local-mode users) ---

export const lookupCachedFavicons = query({
  args: { domains: v.array(v.string()) },
  handler: async (ctx, { domains }) => {
    const results: { domain: string; iconUrl: string; source: string }[] = [];
    for (const domain of domains) {
      const cached = await ctx.db
        .query("faviconCache")
        .withIndex("by_domain", (q) => q.eq("domain", domain))
        .first();
      if (cached) {
        results.push({ domain: cached.domain, iconUrl: cached.iconUrl, source: cached.source });
      }
    }
    return results;
  },
});
