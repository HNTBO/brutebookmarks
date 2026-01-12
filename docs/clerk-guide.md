# Clerk Authentication Guide for Bookmark Grid

Complete guide to implement Clerk authentication, replacing Nginx Basic Auth.

> [!NOTE]
> This project runs on **port 3002** and is deployed at `bookmarks.fmotion.fr`.

---

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   FRONTEND (Vanilla JS)                     │
│                                                             │
│  ClerkJS (CDN)                                              │
│  ├── Loads from /api/config (publishable key)              │
│  ├── Handles sign-in/sign-out UI                           │
│  ├── Manages session                                        │
│  └── Provides getToken() for API calls                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (Express)                         │
│                                                             │
│  @clerk/express middleware                                  │
│  ├── clerkMiddleware() - Attaches auth to all requests     │
│  └── requireAuth() - Protects /api/* routes                │
└─────────────────────────────────────────────────────────────┘
```

---

## Part 1: Clerk Dashboard Setup

### Step 1.1: Create Clerk Application

1. Go to [clerk.com](https://clerk.com) and sign up/sign in
2. Click **"Create application"**
3. Name it **"Bookmark Grid"**
4. Enable authentication methods:
   - ✅ **Email** (recommended)
   - ✅ **Google** (optional)
   - ✅ **GitHub** (optional)
5. Click **Create**

### Step 1.2: Get API Keys

1. In your Clerk Dashboard, go to **Configure → API Keys**
2. Copy these two keys:
   - `CLERK_PUBLISHABLE_KEY` (starts with `pk_test_` or `pk_live_`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_` or `sk_live_`)

> [!IMPORTANT]
> **Test vs Live keys**: Use `pk_test_`/`sk_test_` for local dev. Switch to `pk_live_`/`sk_live_` for production.

### Step 1.3: Configure Allowed Origins

1. Go to **Configure → Paths** (or Settings)
2. Add allowed origins:
   - `http://localhost:3002` (local dev)
   - `https://bookmarks.fmotion.fr` (production)

---

## Part 2: Local Setup

### Step 2.1: Create .env File

```bash
cd BookMark_Grid
cp .env.example .env
```

Edit `.env`:

```env
# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
CLERK_SECRET_KEY=sk_test_YOUR_KEY_HERE

# App Configuration
PORT=3002
NODE_ENV=development
```

### Step 2.2: Install Dependencies

```bash
npm install
```

Dependencies already in `package.json`:
- `@clerk/express` - Backend middleware
- `dotenv` - Environment variable loading

---

## Part 3: Backend Integration

### Step 3.1: Middleware File

File already exists at `middleware/clerk-auth.js`:

```javascript
const { clerkMiddleware, requireAuth, getAuth } = require('@clerk/express');

function setupClerkMiddleware(app) {
  if (!process.env.CLERK_SECRET_KEY) {
    console.warn('[Auth] CLERK_SECRET_KEY not set - running without authentication');
    return;
  }
  app.use(clerkMiddleware());
  console.log('[Auth] Clerk middleware enabled');
}

const protectApiRoutes = (req, res, next) => {
  if (!process.env.CLERK_SECRET_KEY) return next();
  if (req.path === '/config') return next(); // Public endpoint
  return requireAuth({ signInUrl: '/' })(req, res, next);
};

function getUserId(req) {
  if (!process.env.CLERK_SECRET_KEY) return null;
  const auth = getAuth(req);
  return auth?.userId || null;
}

module.exports = { setupClerkMiddleware, protectApiRoutes, getUserId, getAuth };
```

### Step 3.2: Update server.js

Add these changes to `server.js`:

#### Add import at top (after line 8):

```javascript
// Authentication
require('dotenv').config();
const { setupClerkMiddleware, protectApiRoutes } = require('./middleware/clerk-auth');
```

#### Add Clerk middleware after express.json() (after line 17):

```javascript
// Clerk authentication middleware
setupClerkMiddleware(app);
```

#### Add config endpoint (before your first API route):

```javascript
// ============ CONFIG ENDPOINT (PUBLIC) ============
app.get('/api/config', (req, res) => {
  res.json({
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null,
  });
});

// ============ API ROUTE PROTECTION ============
app.use('/api', protectApiRoutes);
```

### Complete Diff for server.js

```diff
 const express = require('express');
 const multer = require('multer');
 const axios = require('axios');
 const sharp = require('sharp');
 const path = require('path');
 const fs = require('fs').promises;
 const crypto = require('crypto');
 const cors = require('cors');

+// Authentication
+require('dotenv').config();
+const { setupClerkMiddleware, protectApiRoutes } = require('./middleware/clerk-auth');

 const app = express();
 const PORT = process.env.PORT || 3002;

 // Middleware
 app.use(cors());
 app.use(express.json());
 app.use(express.static('public'));
 app.use('/icons', express.static('icons'));

+// Clerk authentication middleware
+setupClerkMiddleware(app);
+
+// ============ CONFIG ENDPOINT (PUBLIC) ============
+app.get('/api/config', (req, res) => {
+  res.json({
+    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null,
+  });
+});
+
+// ============ API ROUTE PROTECTION ============
+app.use('/api', protectApiRoutes);

 // Ensure icons directory exists
 const ICONS_DIR = path.join(__dirname, 'icons');
```

---

## Part 4: Frontend Integration

### Step 4.1: Auth Helper Files

These files already exist in `public/js/`:

**public/js/auth.js** - Clerk SDK loader and helpers:
- `initClerk()` - Loads Clerk from CDN
- `requireAuth()` - Shows sign-in if not authenticated
- `getAuthToken()` - Gets JWT for API calls
- `mountUserButton()` - Renders user avatar dropdown

**public/js/auth-fetch.js** - Authenticated fetch wrapper:
- `authFetch()` - Adds Bearer token to requests
- `enableAuthFetch()` - Overrides global fetch

### Step 4.2: Update index.html

#### Add scripts in `<head>` (after existing links):

```html
<!-- Clerk Authentication -->
<script src="/js/auth.js"></script>
<script src="/js/auth-fetch.js"></script>
```

#### Add user button container at start of `<body>`:

```html
<body>
    <!-- Clerk User Button -->
    <div id="clerk-user-button" style="position: fixed; top: 16px; right: 16px; z-index: 9999;"></div>
    
    <!-- Rest of your content... -->
```

#### Wrap initialization code:

Find the `<script>` tag at the bottom with your app initialization and wrap it:

```html
<script>
(async function() {
    // Initialize Clerk auth
    await BookmarkAuth.initClerk();
    
    // Check if user is signed in
    const isAuth = await BookmarkAuth.requireAuth();
    if (!isAuth) {
        // Sign-in flow started, don't continue loading
        return;
    }
    
    // Mount user button (avatar dropdown)
    BookmarkAuth.mountUserButton('#clerk-user-button');
    
    // Enable authenticated fetch for all API calls
    enableAuthFetch();
    
    // ========== YOUR EXISTING INIT CODE BELOW ==========
    // loadData(), renderCategories(), event listeners, etc.
    
})();
</script>
```

---

## Part 5: Testing Locally

```bash
npm run dev
```

1. Open http://localhost:3002
2. Should see Clerk sign-in UI (modal or redirect)
3. Sign in with your email
4. Should see user avatar in top-right corner
5. Bookmarks should load and work normally
6. Open DevTools → Network → verify API calls have `Authorization: Bearer` header

### Test Checklist

- [ ] Sign-in modal appears for unauthenticated users
- [ ] After sign-in, user avatar appears
- [ ] API calls work when signed in
- [ ] API returns 401 when not signed in (test with auth disabled)
- [ ] Sign-out works (click avatar → Sign out)

---

## Part 6: VPS Deployment (Docker)

### Step 6.1: SSH to VPS

```bash
ssh root@46.62.220.149
```

### Step 6.2: Clone/Pull Repository

```bash
cd /var/www
git clone https://github.com/HNTBO/BookMark_Grid.git bookmarks.fmotion.fr
# Or if already exists:
cd /var/www/bookmarks.fmotion.fr && git pull
```

### Step 6.3: Create Production .env

```bash
cd /var/www/bookmarks.fmotion.fr

cat > .env << 'EOF'
# Clerk Authentication (PRODUCTION KEYS)
CLERK_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_KEY_HERE
CLERK_SECRET_KEY=sk_live_YOUR_LIVE_KEY_HERE

# App Configuration
PORT=3002
NODE_ENV=production
EOF
```

> [!CAUTION]
> Use **live keys** (`pk_live_`, `sk_live_`) in production! Get them from Clerk Dashboard → API Keys → switch to "Production" instance.

### Step 6.4: Build and Start Container

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f
```

### Step 6.5: Update Nginx Config

Edit `/etc/nginx/sites-available/bookmarks.fmotion.fr`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name bookmarks.fmotion.fr;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name bookmarks.fmotion.fr;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/fmotion.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fmotion.fr/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Test and reload:

```bash
nginx -t && systemctl reload nginx
```

### Step 6.6: Verify Production

1. Visit https://bookmarks.fmotion.fr
2. Should see Clerk sign-in overlay
3. Sign in and verify everything works

### Step 6.7: Updating the App

```bash
cd /var/www/bookmarks.fmotion.fr
git pull
docker compose up -d --build
```

---

## Troubleshooting

### Sign-in not appearing

```bash
# Check if Clerk keys are set
grep CLERK /var/www/bookmarks.fmotion.fr/.env

# Check app logs
journalctl -u bookmarks -n 50
```

### API returns 401

- Verify frontend is sending `Authorization` header (check DevTools → Network)
- Check that `enableAuthFetch()` is called before any API requests
- Verify Clerk session is active

### CORS errors

Add your domain to Clerk Dashboard → Configure → Paths → Allowed Origins

### Port conflict

```bash
# Check what's using a port
sudo lsof -i :3002

# Kill process if needed
sudo kill -9 <PID>
```

---

## Quick Reference

| Item | Value |
|------|-------|
| Local URL | http://localhost:3002 |
| Production URL | https://bookmarks.fmotion.fr |
| Port | 3002 |
| Clerk Dashboard | https://dashboard.clerk.com |
| VPS Path | /var/www/bookmarks.fmotion.fr |
| Service Name | bookmarks |
| Nginx Config | /etc/nginx/sites-available/bookmarks.fmotion.fr |

---

## Files Summary

| File | Purpose |
|------|---------|
| `.env` | Clerk keys and port config |
| `middleware/clerk-auth.js` | Server-side auth middleware |
| `public/js/auth.js` | Frontend Clerk SDK loader |
| `public/js/auth-fetch.js` | Authenticated fetch wrapper |
| `server.js` | Express server (needs changes) |
| `public/index.html` | Main HTML (needs changes) |

---

## Verification Checklist

### Local Development
- [ ] `.env` created with test keys
- [ ] `npm install` run
- [ ] `server.js` changes applied
- [ ] `index.html` changes applied
- [ ] Local test passes (http://localhost:3002)

### Clerk Dashboard
- [ ] Bookmark Grid application created
- [ ] Auth methods configured
- [ ] Allowed origins added

### VPS Deployment
- [ ] `.env` created with **live** keys
- [ ] Code pulled and installed
- [ ] systemd service updated (port 3002)
- [ ] Nginx config updated (port 3002)
- [ ] Basic Auth removed from Nginx
- [ ] Production test passes
