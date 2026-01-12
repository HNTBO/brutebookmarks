# Excalinest Deployment & Integration Report
**Date:** January 12, 2026
**Version:** 1.0.0

## 1. Overview
This document summarizes the transition of `nestalidraw` to `Excalinest`, the integration of Clerk authentication, and the successful deployment to a VPS (`draw.fmotion.fr`).

## 2. Integration Features
### Clerk Authentication
- **Backend (`api/middleware/clerk-auth.js`)**: Custom middleware validates Clerk JWT tokens.
  - Public routes: `/config` (exposes public key), `/health`.
  - Protected routes: All `/api/*` endpoints (requires valid session).
- **Frontend (`web/src/ui/App.jsx`)**:
  - Wrapped in `<ClerkProvider>`.
  - Conditional rendering: Login button for guests, User Profile button for authenticated users.
  - `useAuthFetch` hook: Automatically injects `Authorization: Bearer <token>` into API requests.

### Docker Architecture
- **Environment Variables**:
  - `CLERK_PUBLISHABLE_KEY` passed to frontend at build time (Vite requirement).
  - Secrets passed to backend at runtime.
- **Nginx (Container)**: Proxies `/api` requests to the backend container to avoid CORS issues and simplify routing.

## 3. Deployment Challenges & Solutions

### A. SSH & Repository Access
- **Challenge**: "Permission denied" when cloning on VPS. Confusion between project-specific keys vs. account keys.
- **Solution**: Established that a single GitHub Account SSH key is best practice. Removed the old project-specific key and promoted the VPS key to the user's GitHub account settings.

### B. Directory Structure
- **Challenge**: `git clone` created a nested `Excalinest/Excalinest` folder structure.
- **Solution**: Moved contents up one level and removed the empty parent directory to align with Docker Compose paths.

### C. DNS & Wildcards
- **Challenge**: `draw.fmotion.fr` failed to resolve initially. The existing wildcard `*.fmotion.fr` was not picking up immediately, or local propagation was delayed.
- **Solution**: Forced resolution by adding a specific **A Record** for `draw` pointing to the VPS IP (`46.62.220.149`).

### D. Legacy Nginx Conflict (Basic Auth)
- **Challenge**: After deployment, a browser password prompt appeared.
- **Cause**: A leftover Nginx config file (`/etc/nginx/sites-enabled/draw`) from a previous installation was conflicting with the new `draw.fmotion.fr` config. The old file contained `auth_basic`.
- **Solution**: Removed the symlink to the old `draw` site and reloaded Nginx.

### E. Redirect Loop (`ERR_TOO_MANY_REDIRECTS`)
- **Challenge**: Browsers failed to load the site, showing a redirect loop error.
- **Cause**: The Nginx HTTPS server block (port 443) contained a `return 301 https://...` directive, causing it to redirect to itself infinitely.
- **Solution**: Rewrote the Nginx configuration to cleanly separate:
  - **Port 80**: Redirects to HTTPS.
  - **Port 443**: Handles SSL and proxies traffic to localhost:3100.

## 4. Final Status
- **URL**: [https://draw.fmotion.fr](https://draw.fmotion.fr)
- **Auth**: Fully functional (Clerk).
- **SSL**: Auto-renewing (Let's Encrypt).
- **Infrastructure**: Docker Compose (Api + Web) behind Nginx Reverse Proxy.
