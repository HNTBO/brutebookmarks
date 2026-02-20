import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  tabGroups: defineTable({
    name: v.string(),
    order: v.float64(),
    userId: v.string(),
  })
    .index('by_user', ['userId'])
    .index('by_user_order', ['userId', 'order']),

  categories: defineTable({
    name: v.string(),
    order: v.float64(),
    userId: v.string(),
    groupId: v.optional(v.id('tabGroups')),
  })
    .index('by_user', ['userId'])
    .index('by_user_order', ['userId', 'order']),

  bookmarks: defineTable({
    title: v.string(),
    url: v.string(),
    iconPath: v.optional(v.string()),
    storageId: v.optional(v.id('_storage')),
    categoryId: v.id('categories'),
    order: v.float64(),
    userId: v.string(),
  })
    .index('by_category', ['categoryId'])
    .index('by_user', ['userId'])
    .index('by_category_order', ['categoryId', 'order']),

  faviconCache: defineTable({
    domain: v.string(),
    iconUrl: v.string(),
    source: v.string(),
    fetchedAt: v.float64(),
  }).index('by_domain', ['domain']),

  userPreferences: defineTable({
    userId: v.string(),
    theme: v.string(),
    accentColorDark: v.optional(v.string()),
    accentColorLight: v.optional(v.string()),
    wireframeDark: v.optional(v.boolean()),
    wireframeLight: v.optional(v.boolean()),
    cardSize: v.float64(),
    pageWidth: v.float64(),
    showCardNames: v.boolean(),
    autofillUrl: v.optional(v.boolean()),
    foundingMemberSince: v.optional(v.float64()),
    updatedAt: v.float64(),
  }).index('by_user', ['userId']),

  syncWatermarks: defineTable({
    userId: v.string(),
    revision: v.float64(),
    updatedAt: v.float64(),
  }).index('by_user', ['userId']),
});
