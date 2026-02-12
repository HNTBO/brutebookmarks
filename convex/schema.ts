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

  userPreferences: defineTable({
    userId: v.string(),
    theme: v.string(),
    accentColorDark: v.optional(v.string()),
    accentColorLight: v.optional(v.string()),
    cardSize: v.float64(),
    pageWidth: v.float64(),
    showCardNames: v.boolean(),
    autofillUrl: v.optional(v.boolean()),
    updatedAt: v.float64(),
  }).index('by_user', ['userId']),
});
