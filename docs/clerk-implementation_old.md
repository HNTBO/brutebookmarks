# Clerk Authentication Implementation for Bookmark Grid

This document outlines how to add Clerk authentication to Bookmark Grid.

## Files Created

| File | Purpose |
|------|---------|
| `middleware/clerk-auth.js` | Server-side auth middleware |
| `public/js/auth.js` | Frontend Clerk SDK loader |
| `public/js/auth-fetch.js` | Authenticated fetch wrapper |
| `.env.example` | Environment variables template |
| `package.json` | Updated with @clerk/express, dotenv |

---

## Implementation Steps

### Step 1: Create Clerk Account

1. Go to https://clerk.com and sign up
2. Create a new application named "Bookmark Grid"
3. Enable Email authentication (and optionally Google, GitHub)
4. Copy `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`

### Step 2: Local Setup

```bash
cd BookMark_Grid

# Create .env from template
cp .env.example .env

# Edit .env and add your Clerk keys

# Install new dependencies
npm install
```

### Step 3: Apply Server Changes

Edit `server.js` with these changes:

#### 3.1 Add import at the top (after line 8)

```javascript
// Authentication
const { setupClerkMiddleware, protectApiRoutes } = require('./middleware/clerk-auth');
```

#### 3.2 Add Clerk middleware after express.json() (after line 15)

```javascript
// Clerk authentication middleware
setupClerkMiddleware(app);
```

#### 3.3 Add config endpoint (after line 26)

```javascript
// ============ CONFIG ENDPOINT (PUBLIC) ============

// Public endpoint for frontend to get Clerk publishable key
app.get('/api/config', (req, res) => {
  res.json({
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null,
  });
});

// ============ API ROUTE PROTECTION ============

// Protect all /api/* routes except /api/config
app.use('/api', protectApiRoutes);
```

### Step 4: Frontend Integration

Edit `public/index.html`:

#### 4.1 Add scripts in `<head>`

```html
<script src="/js/auth.js"></script>
<script src="/js/auth-fetch.js"></script>
```

#### 4.2 Add user button container at start of `<body>`

```html
<div id="clerk-user-button" style="position: fixed; top: 10px; right: 10px; z-index: 9999;"></div>
```

#### 4.3 Wrap the existing initialization code

Find the main initialization script and wrap it:

```html
<script>
(async function() {
  // Initialize auth
  await BookmarkAuth.initClerk();

  // Check if user is signed in
  const isAuth = await BookmarkAuth.requireAuth();
  if (!isAuth) {
    // Sign-in flow started, don't continue loading
    return;
  }

  // Mount user button
  BookmarkAuth.mountUserButton('#clerk-user-button');

  // Enable authenticated fetch for all API calls
  enableAuthFetch();

  // Continue with existing initialization...
  // (existing loadData(), renderCategories(), etc.)
})();
</script>
```

### Step 5: Test Locally

```bash
npm run dev
```

1. Open http://localhost:3000
2. Should see Clerk sign-in UI
3. Sign in with your email
4. Should see your user avatar in top-right
5. Bookmarks should load and save normally

### Step 6: Deploy to VPS

```bash
# SSH to VPS
ssh root@46.62.220.149

# Navigate to project
cd /var/www/bookmarks  # or wherever it's deployed

# Create .env with production keys
cat > .env << 'EOF'
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
PORT=3001
NODE_ENV=production
EOF

# Pull changes
git pull

# Rebuild (if using Docker)
docker compose up -d --build

# Or restart systemd service (if using systemd)
sudo systemctl restart bookmarks
```

### Step 7: Update Nginx (Remove Basic Auth)

Edit `/etc/nginx/sites-available/bookmarks.fmotion.fr`:

```nginx
server {
    # ... SSL config ...

    # REMOVE these lines:
    # auth_basic "Private";
    # auth_basic_user_file /etc/nginx/.htpasswd;

    location / {
        proxy_pass http://localhost:3001;
        # ... rest of config ...
    }
}
```

Reload Nginx:
```bash
nginx -t && systemctl reload nginx
```

---

## Complete Server.js Diff

```diff
--- a/server.js
+++ b/server.js
@@ -6,6 +6,9 @@ const fs = require('fs').promises;
 const crypto = require('crypto');
 const cors = require('cors');

+// Authentication
+const { setupClerkMiddleware, protectApiRoutes } = require('./middleware/clerk-auth');
+
 const app = express();
 const PORT = process.env.PORT || 3000;

@@ -15,6 +18,21 @@ app.use(express.json());
 app.use(express.static('public'));
 app.use('/icons', express.static('icons'));

+// Clerk authentication middleware
+setupClerkMiddleware(app);
+
+// ============ CONFIG ENDPOINT (PUBLIC) ============
+
+// Public endpoint for frontend to get Clerk publishable key
+app.get('/api/config', (req, res) => {
+  res.json({
+    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null,
+  });
+});
+
+// Protect all /api/* routes except /api/config
+app.use('/api', protectApiRoutes);
+
 // Ensure icons directory exists
 const ICONS_DIR = path.join(__dirname, 'icons');
 fs.mkdir(ICONS_DIR, { recursive: true }).catch(console.error);
```

---

## Notes

- **Same Clerk app**: You can use the same Clerk application for both Storyboard and Bookmark Grid (same credentials work on both)
- **Graceful degradation**: If Clerk keys are not set, the app runs without authentication
- **Password manager**: Clerk's sign-in UI is a proper form that works with password managers

---

## Verification Checklist

- [ ] Clerk account created
- [ ] `.env` file created with keys
- [ ] `npm install` run
- [ ] `server.js` changes applied
- [ ] `index.html` changes applied
- [ ] Local test passes
- [ ] VPS `.env` created
- [ ] VPS deployment updated
- [ ] Nginx Basic Auth removed
- [ ] Production test passes
