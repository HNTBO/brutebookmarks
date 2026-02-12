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
- Watch for Clerk auth initialization issues — if the app hangs, check for zombie processes on dev ports (3000, 3002, 5173).

## Project Overview

Brute Bookmarks is a bookmark manager with real-time cross-device sync. TypeScript frontend (Vite) deployed on Vercel, Convex real-time backend, optional Clerk authentication. Also supports self-hosted deployment via Docker/Express for users who prefer local-only storage.

## Commands

```bash
# Frontend dev (Vite, port 5173)
npm run dev

# Backend dev (Express, port 3002) — run alongside Vite
npm run dev:server

# Production build
npm run build

# Preview production build
npm run preview

# Production backend
npm start

# Docker
docker-compose up --build
```

Vite dev server proxies `/api/*` and `/icons/*` to Express on port 3002.

## Architecture

### Frontend (Vite + TypeScript)

Entry point: `index.html` -> `src/main.ts`

```
src/
  main.ts                    # Entry: init CSS, Clerk, Convex, render app
  app.ts                     # renderApp(): HTML shell
  types.ts                   # Category, Bookmark, UserPreferences interfaces
  styles/main.css            # All CSS (extracted from legacy monolith)
  auth/
    clerk.ts                 # @clerk/clerk-js init + Convex setAuth wiring
    auth-fetch.ts            # Token-injecting fetch wrapper (transitional)
  components/
    header.ts                # 2D size controller
    categories.ts            # Category list rendering
    bookmark-card.ts         # Card render + proximity hover
    icon-picker.ts           # Wikimedia/emoji/upload/favicon search UI
    modals/
      bookmark-modal.ts      # Add/edit bookmark
      category-modal.ts      # Add/edit category
      settings-modal.ts      # Settings (theme, export/import)
  data/
    store.ts                 # Categories state, initializeData, saveData
    local-storage.ts         # Typed localStorage helpers
    convex-client.ts         # ConvexClient setup + setAuth
  features/
    drag-drop.ts             # All drag & drop handlers
    theme.ts                 # Toggle, accent color management
    preferences.ts           # Card size, page width, card names
  utils/
    icons.ts                 # getIconUrl() helper
```

### Convex (real-time backend — in progress)

```
convex/
  schema.ts                  # categories, bookmarks, userPreferences tables
  auth.config.ts             # Clerk JWT issuer config
  categories.ts              # Stub (TODO: beads-zml)
  bookmarks.ts               # Stub (TODO: beads-zml)
  preferences.ts             # Stub (TODO: beads-1ri)
  icons.ts                   # Stub (TODO: beads-c5h)
```

Schema uses normalized tables: categories and bookmarks are separate with foreign keys. `float64` ordering for drag-drop reordering.

### Express Backend (`server.js`) — transitional

- Handles icon fetching, caching, and data persistence during migration
- Icons cached in `/icons/` directory (hash-based filenames)
- Bookmark data stored in `/data/bookmarks.json`
- All `/api/*` routes protected by Clerk (except `/api/config`)
- Will be replaced by Convex functions incrementally

### Authentication

- **Frontend**: `@clerk/clerk-js` npm package (src/auth/clerk.ts)
- **Backend (Express)**: `@clerk/express` middleware (middleware/clerk-auth.js)
- **Convex**: Clerk JWT template wired via `ConvexClient.setAuth`
- Optional: runs without auth if `CLERK_SECRET_KEY` is empty

## Key API Endpoints (Express — transitional)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/config` | GET | Public - returns Clerk publishable key |
| `/api/search-icons?query=X` | GET | Search Wikimedia Commons |
| `/api/download-icon` | POST | Download and cache icon from URL |
| `/api/upload-icon` | POST | Upload custom icon (multipart) |
| `/api/get-favicon` | POST | Fetch site favicon via DuckDuckGo |
| `/api/search-emojis?query=X` | GET | Search Twemoji library |
| `/api/download-emoji` | POST | Convert SVG emoji to cached PNG |
| `/api/data` | GET/POST | Read/write bookmark data |

## Icon Processing Pipeline

All icons (Wikimedia, favicons, uploads, emojis) go through Sharp:
1. Download/receive image
2. Resize to 128x128px (contain mode, transparent background)
3. Convert to PNG
4. Save with MD5 hash filename to `/icons/`
5. Return path like `/icons/abc123.png`

## Environment Variables

```env
CLERK_PUBLISHABLE_KEY=pk_test_...      # Frontend auth (optional)
CLERK_SECRET_KEY=sk_test_...           # Backend auth (optional)
VITE_CONVEX_URL=https://...convex.cloud  # Convex deployment URL
CLERK_JWT_ISSUER_DOMAIN=https://...    # Clerk JWT issuer for Convex
PORT=3002                              # Express server port
NODE_ENV=development                   # development or production
```

## Data Storage

- **Convex** (target): categories, bookmarks, userPreferences tables
- **Express/file** (transitional): `/data/bookmarks.json` + `/icons/` cache
- **localStorage**: `speedDialData` (fallback), theme/accent/cardSize/pageWidth

## Tech Stack

- **Frontend**: TypeScript, Vite, CSS custom properties for theming
- **Real-time backend**: Convex (schema deployed, CRUD stubs pending)
- **Transitional backend**: Express, Sharp (image processing), Multer, Axios
- **Auth**: Clerk (@clerk/clerk-js + @clerk/express)
- **Deployment**: Docker multi-stage build, nginx reverse proxy, systemd service
