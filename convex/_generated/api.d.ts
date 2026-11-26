/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bookmarks from "../bookmarks.js";
import type * as categories from "../categories.js";
import type * as faviconCache from "../faviconCache.js";
import type * as favicon_candidates from "../favicon_candidates.js";
import type * as favicons from "../favicons.js";
import type * as icons from "../icons.js";
import type * as metadata from "../metadata.js";
import type * as preferences from "../preferences.js";
import type * as seed from "../seed.js";
import type * as ssrf_guard from "../ssrf_guard.js";
import type * as syncMeta from "../syncMeta.js";
import type * as tabGroups from "../tabGroups.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bookmarks: typeof bookmarks;
  categories: typeof categories;
  faviconCache: typeof faviconCache;
  favicon_candidates: typeof favicon_candidates;
  favicons: typeof favicons;
  icons: typeof icons;
  metadata: typeof metadata;
  preferences: typeof preferences;
  seed: typeof seed;
  ssrf_guard: typeof ssrf_guard;
  syncMeta: typeof syncMeta;
  tabGroups: typeof tabGroups;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
