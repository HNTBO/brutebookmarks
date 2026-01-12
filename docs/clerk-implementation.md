# Clerk Authentication for Excalinest

This guide covers adding Clerk authentication to Excalinest, replacing Nginx Basic Auth.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React)                        │
│                                                             │
│  ClerkJS                                                    │
│  ├── Handles sign-in/sign-out UI                           │
│  ├── Manages session                                        │
│  └── Provides getToken() for API calls                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (Express)                       │
│                                                             │
│  @clerk/express middleware                                  │
│  ├── clerkMiddleware() - Attaches auth to all requests     │
│  └── requireAuth() - Protects specific routes              │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Create Clerk Application

1. Go to https://clerk.com and sign up
2. Create application named "Excalinest"
3. Enable authentication methods (Email, Google, etc.)
4. Copy keys:
   - `CLERK_PUBLISHABLE_KEY` (starts with `pk_`)
   - `CLERK_SECRET_KEY` (starts with `sk_`)

## Step 2: Backend Setup

### Install Dependencies

```bash
cd api
npm install @clerk/express dotenv
```

### Create .env

```env
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### Create Middleware (api/middleware/clerk-auth.js)

```javascript
require('dotenv').config();
const { clerkMiddleware, requireAuth, getAuth } = require('@clerk/express');

function setupClerkMiddleware(app) {
  // Only add Clerk if configured
  if (process.env.CLERK_SECRET_KEY) {
    app.use(clerkMiddleware());
  }
}

function protectApiRoutes(req, res, next) {
  // Skip protection if Clerk not configured
  if (!process.env.CLERK_SECRET_KEY) {
    return next();
  }
  
  // Allow config endpoint
  if (req.path === '/config') {
    return next();
  }
  
  // Require auth for everything else
  return requireAuth({ signInUrl: '/' })(req, res, next);
}

function getUserId(req) {
  const auth = getAuth(req);
  return auth?.userId || null;
}

module.exports = { setupClerkMiddleware, protectApiRoutes, getUserId };
```

### Update server.js

```javascript
// Add at top
require('dotenv').config();
const { setupClerkMiddleware, protectApiRoutes } = require('./middleware/clerk-auth');

// After express.json()
setupClerkMiddleware(app);

// Config endpoint (public)
app.get('/api/config', (req, res) => {
  res.json({
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || null,
  });
});

// Protect API routes
app.use('/api', protectApiRoutes);
```

## Step 3: Frontend Setup (React)

### Install Clerk React

```bash
cd web
npm install @clerk/clerk-react
```

### Update App.jsx

```jsx
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function App() {
  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      <SignedOut>
        <div className="auth-container">
          <h1>Excalinest</h1>
          <SignInButton mode="modal">
            <button className="sign-in-btn">Sign In</button>
          </SignInButton>
        </div>
      </SignedOut>
      
      <SignedIn>
        <div className="user-button">
          <UserButton afterSignOutUrl="/" />
        </div>
        {/* Your Excalidraw component */}
      </SignedIn>
    </ClerkProvider>
  );
}
```

### Authenticated API Calls

```javascript
import { useAuth } from '@clerk/clerk-react';

function useAuthFetch() {
  const { getToken } = useAuth();
  
  return async (url, options = {}) => {
    const token = await getToken();
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    });
  };
}
```

### Environment Variables (web/.env)

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

## Step 4: Docker Configuration

### Update docker-compose.yml

```yaml
services:
  excalinest-api:
    environment:
      - CLERK_PUBLISHABLE_KEY=${CLERK_PUBLISHABLE_KEY}
      - CLERK_SECRET_KEY=${CLERK_SECRET_KEY}
  
  excalinest-web:
    environment:
      - VITE_CLERK_PUBLISHABLE_KEY=${CLERK_PUBLISHABLE_KEY}
```

### VPS .env

```bash
# On VPS, create .env with production keys
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
```

## Step 5: Remove Nginx Basic Auth

After Clerk is working, edit `/etc/nginx/sites-available/draw.fmotion.fr`:

```nginx
server {
    # REMOVE these lines:
    # auth_basic "Private";
    # auth_basic_user_file /etc/nginx/.htpasswd;
    
    location / {
        proxy_pass http://localhost:3100;
        # ...
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

## Testing Checklist

- [ ] Sign-in flow works
- [ ] User avatar appears when signed in
- [ ] API calls work when signed in
- [ ] API returns 401 when not signed in
- [ ] Sign-out works
- [ ] Docker deployment works

## Why Clerk vs Nginx Basic Auth

| Aspect | Nginx Basic Auth | Clerk |
|--------|------------------|-------|
| UI | Browser popup | Polished login page |
| User identity | Unknown | App knows who's logged in |
| Password manager | Poor support | Full support |
| Multi-provider | No | Google, GitHub, Email |
| Session | Annoying re-login | Persistent sessions |

## Reference

- [Clerk Express Quickstart](https://clerk.com/docs/expressjs/quickstart)
- [Clerk React Quickstart](https://clerk.com/docs/quickstarts/react)
