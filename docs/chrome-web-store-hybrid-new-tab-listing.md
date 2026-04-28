# Chrome Web Store Listing - BruteBookmarks New Tab

Working copy for the Chrome Web Store listing of the hybrid new-tab extension.

## Recommended Listing

### Item Title

BruteBookmarks New Tab

### Item Summary

Open BruteBookmarks from every new tab, with a lightweight cached fallback when the app cannot load.

Character count: 99

### Detailed Description

BruteBookmarks New Tab turns your browser's new tab into your BruteBookmarks dashboard.

When your connection is working normally, each new tab opens the full BruteBookmarks web app. If the app cannot be reached, the extension can show a lightweight fallback page with your cached bookmarks, categories, icons, theme, and accent color.

This fallback is intentionally simple. It is there so your bookmark dashboard remains useful when the hosted app is unavailable, not to replace the full BruteBookmarks experience.

Key features:

- Opens BruteBookmarks from every new tab
- Checks whether the BruteBookmarks app is reachable
- Shows a cached fallback page when the app cannot load
- Lets you browse cached bookmarks by category
- Keeps your saved theme and accent color when available
- Provides one clear path back to the full BruteBookmarks app

BruteBookmarks is a visual bookmark dashboard with a bold, brutalist interface. Use it to organize bookmarks into categories and tab groups, customize the look of your dashboard, and sync your bookmarks across devices when signed in.

Privacy:

- No ads
- No tracking
- No selling data
- No bookmark analysis for advertising
- No machine learning training on your bookmark data

The extension stores cached fallback data locally in your browser. When sync is enabled, bookmarks and preferences are stored through BruteBookmarks so they can appear across your devices.

Learn more: https://brutebookmarks.com

Privacy policy: https://brutebookmarks.com/privacy

## Shorter Alternative

BruteBookmarks New Tab opens your BruteBookmarks dashboard from every new tab and includes a lightweight fallback when the app cannot load.

If the hosted app is reachable, the extension opens the full BruteBookmarks experience. If it is not reachable, the extension shows cached bookmarks in a simple category view so your most important links remain available.

Features:

- New-tab access to BruteBookmarks
- Cached fallback when the app is unreachable
- Category browsing
- Saved theme and accent color when available
- One-click return to the full app
- No ads or tracking

## Privacy Practices Draft

Use this as Chrome Web Store dashboard wording or support text.

### Single Purpose

BruteBookmarks New Tab replaces the browser new tab with BruteBookmarks and provides a lightweight cached fallback when the hosted app is unreachable.

### Permission Justification

Storage:
Used to keep extension settings, authentication state, cached theme preferences, and cached fallback bookmark snapshots locally in the browser.

Bookmarks:
Used only for BruteBookmarks browser bookmark import features. The extension reads browser bookmarks only when the user explicitly triggers an import.

Tabs:
Used to open and navigate BruteBookmarks pages from the extension and new-tab experience.

Host permissions:

- `https://brutebookmarks.com/*` is used to connect the extension with the BruteBookmarks web app and check whether the hosted app is reachable.
- `https://*.convex.cloud/*` is used to sync BruteBookmarks data when the user is signed in.

### Data Use Statement

BruteBookmarks does not track browsing activity, analyze bookmark content for advertising, sell user data, or use bookmark data for machine learning training. Bookmark data is stored locally unless the user signs in to enable sync.

## Screenshot Ideas

1. Full BruteBookmarks dashboard opened from a new tab
2. Cached fallback view with bookmarks
3. Category selector in the fallback view
4. Light and dark theme examples
5. One-click return path to the full app

## Notes

- Current manifest description: "Open BruteBookmarks from your new tab with a native fallback when the app is unreachable."
- Store-facing copy should prefer "cached fallback" over "native fallback"; it is clearer for users.
- Avoid promising full offline mode. The fallback depends on cached data and extension auth state.
- Avoid implying the extension replaces or enhances Chrome search.
- Avoid "hybrid" in user-facing copy unless needed for internal package naming.
