# Brute Bookmarks

A bookmark manager with real-time cross-device sync, category and tab group organization, and a brutalist UI. Built with Vite + TypeScript, Convex real-time backend, and Clerk authentication. Deployed on Vercel.

## Features

### Core
- **Category Organization** - Organize bookmarks into custom categories
- **Tab Groups** - Group related categories into tabbed containers
- **Drag & Drop** - Reorder bookmarks, categories, and tab groups freely
- **Dark/Light Theme** - Toggle with custom accent colors
- **Cross-Device Sync** - Real-time sync via Convex subscriptions

### Icon Management
- **Favicon Auto-Fetch** - Grab site favicons with one click
- **Wikimedia Search** - Find high-quality logos from Wikimedia Commons
- **Emoji Icons** - Use Twemoji icons for bookmarks
- **Custom Upload** - Upload your own icons (drag-and-drop supported)

### Data Management
- **Export/Import** - Backup and restore bookmarks as JSON
- **Seed Defaults** - New users get a sample layout to explore features
- **Clipboard Autofill** - Optionally auto-fill URLs from clipboard

### Authentication
- **Clerk Integration** - Sign in with email, Google, GitHub, etc.
- **Privacy-First** - No ads, no tracking

## Tech Stack

- **Frontend**: TypeScript, Vite, CSS custom properties
- **Backend**: Convex (real-time subscriptions + mutations)
- **Auth**: Clerk (`@clerk/clerk-js`)
- **Deployment**: Vercel (frontend) + Convex Cloud (backend)
- **Extension**: WXT framework (Chrome + Firefox)

## Development

```bash
# Install dependencies
npm install

# Start dev server (port 5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Environment Variables

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...  # Clerk publishable key
VITE_CONVEX_URL=https://...convex.cloud  # Convex deployment URL
```

For Vercel deployment, also set `CONVEX_DEPLOY_KEY` and use build command: `npx convex deploy && vite build`.

## Browser Extension

The `extension/` directory contains a WXT-based cross-browser extension for quick-saving bookmarks. See `extension/README.md` for details.

```bash
cd extension
npm install
npx wxt          # Chrome dev
npx wxt --browser firefox  # Firefox dev
```

## License

MIT

## Credits

- Icon sources: [Wikimedia Commons](https://commons.wikimedia.org), [Twemoji](https://github.com/twitter/twemoji), [DuckDuckGo](https://duckduckgo.com) favicons
- Authentication: [Clerk](https://clerk.com)
- Real-time backend: [Convex](https://convex.dev)
- Inspired by: Speed Dial 2 Chrome Extension
