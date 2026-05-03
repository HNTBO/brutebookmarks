# BruteBookmarks New Tab

## Submission Status

Submitted to the Chrome Web Store on 2026-05-03.

## Short Description

Use BruteBookmarks as your flexible bookmark dashboard, right from every new tab.

## Single Purpose

BruteBookmarks New Tab replaces the browser's new tab page with the user's BruteBookmarks dashboard for organizing and opening saved bookmarks.

## Full Description

Use BruteBookmarks as your flexible bookmark dashboard, right from every new tab. Organize bookmarks into categories, group categories into tabs, and rearrange everything with drag and drop.

## Features

- New Tab Dashboard - Replace your browser's new tab with your BruteBookmarks workspace.
- Categories & Tab Groups - Create categories for your bookmarks. Drag one category onto another to group them as tabs.
- Drag & Drop - Reorder bookmarks, categories, and tab groups freely. Move bookmarks between categories.
- Real-Time Sync - Sign in to sync your bookmarks across every device, instantly. Changes appear in real time.
- Works Without an Account - Use BruteBookmarks locally with no sign-up. Your bookmarks stay in your browser until you decide otherwise.
- Import Your Bookmarks - Import from Chrome's built-in bookmarks, JSON backups, or browser HTML exports.
- Smart Icons - Auto-fetch favicons, search Wikimedia Commons for high-quality logos, pick an emoji, or upload your own.

## Customization

- Light, Dark & Auto Themes - Choose a theme directly, or let BruteBookmarks follow your system setting.
- Accent Colors - Pick any color. The interface, favicon, and extension icon adapt.
- Wireframe Mode - A stripped-back, outlined UI style that looks like a blueprint.
- Card Size & Page Width - Resize cards and page width from the header.
- Bar Scale - Cycle through category bar heights to find your ideal density.
- Show or Hide Card Names - Clean icons only, or icons with labels. Your call.

## Privacy

BruteBookmarks does not run ads. It does not track you. It does not sell your data. It does not analyze your bookmarks.

When used locally, your data never leaves your browser. When you sign in to sync, your bookmarks are transmitted over an encrypted connection to Convex Cloud and are only accessible to your account. Authentication is handled by Clerk.

You can export all your data as JSON at any time, and delete everything with one button.

## Permissions - Why We Need Them

- "Read your bookmarks" - Used only when you choose to import your Chrome bookmarks into BruteBookmarks.
- "Storage" - Stores your bookmark data and preferences locally on your device.
- "Replace the page you see when opening a new tab" - Shows your BruteBookmarks dashboard on new tabs.
- "Connect to convex.cloud" - Syncs your bookmark data across devices via an encrypted connection when you're signed in.

## Chrome Web Store Privacy Form

### Permission Justifications

Storage justification:
Stores bookmark data, category structure, user preferences, and cached theme settings locally on the user's device.

Bookmarks justification:
Imports bookmarks from Chrome's built-in bookmark manager only when the user explicitly requests it in the main app. Never accessed otherwise.

Tabs justification:
Opens BruteBookmarks in the background when needed to refresh authentication and keep the new tab experience connected to the user's account.

Host permission justification:
Connects to BruteBookmarks and Convex Cloud over encrypted HTTPS/WSS to load the user's bookmark dashboard and sync bookmark data across devices. Only used for BruteBookmarks functionality.

New tab override justification:
Replaces the browser's new tab page with the user's BruteBookmarks dashboard.

### User Data Disclosures

Recommended checked categories:

- Authentication information - The extension handles authentication/session tokens.
- Web history - Saved bookmarks include URLs and page titles. BruteBookmarks does not track browsing history, but Chrome Web Store may classify saved URLs as web-history-related data.

Recommended unchecked categories:

- Personally identifiable information - Leave unchecked if the extension privacy form is scoped to extension-collected data and the extension does not collect or display the user's name or email. If the form is treated as covering the wider BruteBookmarks service, checking this is the more conservative option because account authentication may involve an email address through Clerk.
- Health information
- Financial and payment information
- Personal communications
- Location
- User activity
- Website content

Required certifications:

- I do not sell or transfer user data to third parties, outside of approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Chrome Web Store Test Instructions

### With Provided Reviewer Credentials

A free BruteBookmarks account is required to test synced new-tab functionality.

To test:

1. Visit https://brutebookmarks.com and sign in with the provided credentials.
2. Open a new browser tab.
3. Confirm the BruteBookmarks dashboard appears as the new tab page.
4. Open a saved bookmark from the dashboard.
5. Return to BruteBookmarks to add, edit, or reorder bookmarks and categories.
6. Open another new tab to confirm the updated dashboard is shown.

### Without Provided Reviewer Credentials

A free BruteBookmarks account is required to test synced new-tab functionality. No credit card is required.

To test:

1. Visit https://brutebookmarks.com and create a free account.
2. Open a new browser tab.
3. Confirm the BruteBookmarks dashboard appears as the new tab page.
4. Add or import bookmarks in BruteBookmarks.
5. Open another new tab to confirm the dashboard shows the saved bookmarks.

## Open Source

BruteBookmarks is open source under the MIT license. You can read every line of code on GitHub.

Made by a solo developer. No venture capital. No growth hacks. Just a bookmark dashboard that respects your time and your data.

contact@brutebookmarks.com
