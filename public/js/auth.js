/**
 * auth.js - Clerk authentication for Bookmark Grid
 * Non-blocking: App loads first, then auth overlay appears
 */

(function() {
  let clerk = null;

  async function initAuth() {
    console.log('[Auth] Starting initialization...');
    
    try {
      // Get publishable key from backend
      const res = await fetch('/api/config');
      const config = await res.json();
      
      if (!config.clerkPublishableKey) {
        console.log('[Auth] No Clerk key configured - running without auth');
        return;
      }
      
      console.log('[Auth] Loading Clerk SDK with key...');

      // Load Clerk SDK with publishable key in data attribute
      await loadClerkSDK(config.clerkPublishableKey);
      
      // Wait for Clerk to be ready
      clerk = window.Clerk;
      
      console.log('[Auth] Clerk loaded, user:', clerk.user ? 'signed in' : 'not signed in');
      
      // Check auth state
      if (clerk.user) {
        console.log('[Auth] User:', clerk.user.primaryEmailAddress?.emailAddress);
        mountUserButton();
      } else {
        console.log('[Auth] Showing sign-in overlay');
        showSignInOverlay();
      }
      
    } catch (err) {
      console.error('[Auth] Error:', err);
    }
  }

  function loadClerkSDK(publishableKey) {
    return new Promise((resolve, reject) => {
      if (window.Clerk && window.Clerk.user !== undefined) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      // Pass key via data attribute (required by Clerk CDN)
      script.setAttribute('data-clerk-publishable-key', publishableKey);
      
      script.onload = async () => {
        try {
          // Clerk auto-initializes when loaded with data attribute
          // Wait for it to be ready
          if (window.Clerk.load) {
            await window.Clerk.load();
          }
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      
      script.onerror = () => reject(new Error('Failed to load Clerk SDK'));
      document.head.appendChild(script);
    });
  }

  function mountUserButton() {
    const container = document.getElementById('clerk-user-button');
    if (container && clerk) {
      clerk.mountUserButton(container, { afterSignOutUrl: '/' });
    }
  }

  function showSignInOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.95);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const signInContainer = document.createElement('div');
    signInContainer.id = 'clerk-sign-in';
    overlay.appendChild(signInContainer);
    document.body.appendChild(overlay);
    
    if (clerk) {
      clerk.mountSignIn(signInContainer, {
        afterSignInUrl: window.location.origin,
        afterSignUpUrl: window.location.origin,
      });
    }
  }

  // Run init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

  // Expose API
  window.BookmarkAuth = {
    getAuthToken: async () => {
      if (!clerk?.session) return null;
      try {
        return await clerk.session.getToken();
      } catch {
        return null;
      }
    },
    getCurrentUser: () => clerk?.user || null,
    signOut: async () => {
      if (clerk) {
        await clerk.signOut();
        window.location.reload();
      }
    },
    initClerk: async () => clerk,
    requireAuth: async () => !!clerk?.user,
    mountUserButton: () => mountUserButton(),
    mountSignIn: () => {},
  };
})();
