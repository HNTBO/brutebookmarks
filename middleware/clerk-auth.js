/**
 * clerk-auth.js - Clerk authentication middleware for Express
 *
 * This module provides authentication middleware for Bookmark Grid.
 * All API routes are protected when Clerk is configured.
 */

const { clerkMiddleware, requireAuth, getAuth } = require('@clerk/express');

/**
 * Initialize Clerk middleware
 * Must be called early in Express setup, after express.json()
 */
function setupClerkMiddleware(app) {
  // Check if Clerk is configured
  if (!process.env.CLERK_SECRET_KEY) {
    console.warn('[Auth] CLERK_SECRET_KEY not set - running without authentication');
    console.warn('[Auth] Set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY in .env to enable auth');
    return;
  }

  // Apply Clerk middleware globally
  // This attaches auth info to req.auth for all requests
  app.use(clerkMiddleware());

  console.log('[Auth] Clerk middleware enabled');
}

/**
 * Middleware to protect routes that require authentication
 * Use: app.get('/api/protected', protectRoute, handler)
 */
const protectRoute = (req, res, next) => {
  // Skip auth if Clerk is not configured
  if (!process.env.CLERK_SECRET_KEY) {
    return next();
  }

  // Use Clerk's requireAuth
  return requireAuth({
    signInUrl: '/',
  })(req, res, next);
};

/**
 * Middleware to protect all /api/* routes
 * Use: app.use('/api', protectApiRoutes)
 */
const protectApiRoutes = (req, res, next) => {
  // Skip auth if Clerk is not configured
  if (!process.env.CLERK_SECRET_KEY) {
    return next();
  }

  // Config endpoint is public (needed to get publishable key)
  if (req.path === '/config') {
    return next();
  }

  // Protect all other /api routes
  return requireAuth({
    signInUrl: '/',
  })(req, res, next);
};

/**
 * Get the authenticated user ID from request
 * Returns null if not authenticated
 */
function getUserId(req) {
  if (!process.env.CLERK_SECRET_KEY) {
    return null;
  }

  const auth = getAuth(req);
  return auth?.userId || null;
}

/**
 * Check if request is authenticated
 */
function isAuthenticated(req) {
  if (!process.env.CLERK_SECRET_KEY) {
    return true; // Allow all if auth not configured
  }

  const auth = getAuth(req);
  return !!auth?.userId;
}

module.exports = {
  setupClerkMiddleware,
  protectRoute,
  protectApiRoutes,
  getUserId,
  isAuthenticated,
  getAuth,
};
