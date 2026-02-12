# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **MANDATORY**: Read [AGENTS.md](AGENTS.md) before starting any work. It contains critical workflow rules for issue tracking with beads (`bd`) and session completion protocols.

## Project Conventions
- This is a TypeScript-first workspace. Always use TypeScript (.ts/.tsx) over JavaScript unless explicitly told otherwise.
- Primary stack: Vite + TypeScript + Convex. When making architectural decisions, default to these technologies.

## UI/CSS Styling Rules
- When making visual/styling changes, make the MINIMAL change requested. Do not introduce new colors or design elements unless asked.
- For active/inactive states, hover effects, and positioning: confirm the expected behavior BEFORE implementing. These are high-error areas.
- Preferred palette: stick to existing theme colors. When in doubt, ask.

## Build & Deploy
- Always run `npm run build` after multi-file changes before committing.
- For Convex deploys: `npx convex deploy && npm run build` (not `--cmd` wrapper).
- Production is on Vercel. Build command: `npx convex deploy && vite build`.

## Project Overview

Brute Bookmarks is a bookmark manager with real-time cross-device sync. TypeScript frontend (Vite) deployed on Vercel, Convex real-time backend, Clerk authentication.

## Commands

```bash
# Dev server (Vite, port 5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

## Architecture

### Frontend (Vite + TypeScript)

Entry point: `index.html` -> `src/main.ts`

```
src/
  main.ts                    # Entry: init CSS, Clerk, Convex, render app
  app.ts                     # renderApp(): HTML shell
  types.ts                   # Category, Bookmark, UserPreferences interfaces
  styles/main.css            # All CSS
  auth/
    clerk.ts                 # @clerk/clerk-js init + Convex setAuth wiring
  components/
    header.ts                # 2D size controller
    categories.ts            # Category list rendering
    bookmark-card.ts         # Card render + proximity hover
    icon-picker.ts           # Wikimedia/emoji/upload/favicon search UI (TODO: migrate to Convex actions)
    modals/
      bookmark-modal.ts      # Add/edit bookmark
      category-modal.ts      # Add/edit category
      settings-modal.ts      # Settings (theme, export/import)
  data/
    store.ts                 # Categories state, Convex subscriptions, mutations
    defaults.ts              # Default seed layout for new users
    local-storage.ts         # Typed localStorage helpers
    convex-client.ts         # ConvexClient setup + setAuth
  features/
    drag-drop.ts             # All drag & drop handlers
    theme.ts                 # Toggle, accent color management
    preferences.ts           # Card size, page width, card names
  utils/
    icons.ts                 # getIconUrl() helper
```

### Convex (real-time backend)

```
convex/
  schema.ts                  # categories, bookmarks, tabGroups, userPreferences tables
  auth.config.ts             # Clerk JWT issuer config
  categories.ts              # Category CRUD + reorder
  bookmarks.ts               # Bookmark CRUD + reorder + bulk import/erase
  tabGroups.ts               # Tab group CRUD + reorder
  preferences.ts             # User preferences get/set
  seed.ts                    # Default layout seeding for new users
```

Schema uses normalized tables: categories and bookmarks are separate with foreign keys. `float64` ordering for drag-drop reordering.

### Browser Extension (`extension/`)

WXT-based cross-browser extension (Chrome MV3, Firefox MV2) for quick-saving bookmarks. Auth bridge via content script on the main app domain.

### Authentication

- **Frontend**: `@clerk/clerk-js` CDN script (src/auth/clerk.ts)
- **Convex**: Clerk JWT template wired via `ConvexClient.setAuth`
- Clerk publishable key read from `VITE_CLERK_PUBLISHABLE_KEY` env var (baked in at build time)

### Icon Picker (TODO: migrate to Convex actions)

The icon picker (`src/components/icon-picker.ts`) currently calls legacy `/api/*` endpoints for Wikimedia search, favicon fetch, emoji search, and custom upload. These endpoints were part of the old Express backend and are **not functional on Vercel**. They need to be reimplemented as Convex HTTP actions.

## Environment Variables

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...  # Clerk publishable key (baked into frontend at build)
VITE_CONVEX_URL=https://...convex.cloud  # Convex deployment URL (baked into frontend at build)
CONVEX_DEPLOY_KEY=prod:...               # Convex deploy key (Vercel build only, not in frontend)
CLERK_JWT_ISSUER_DOMAIN=https://...      # Clerk JWT issuer (Convex dashboard env var)
```

## Data Storage

- **Convex**: categories, bookmarks, tabGroups, userPreferences tables
- **localStorage**: `speedDialData` (instant-render cache), theme/accent/cardSize/pageWidth

## Tech Stack

- **Frontend**: TypeScript, Vite, CSS custom properties for theming
- **Backend**: Convex (real-time subscriptions, mutations, actions)
- **Auth**: Clerk (`@clerk/clerk-js` frontend SDK)
- **Deployment**: Vercel (frontend) + Convex Cloud (backend)
- **Extension**: WXT framework (Chrome + Firefox from single source)
