// Type-only — erased at compile time
type ClerkInstance = import('@clerk/clerk-js').Clerk;

import { setAppMode } from '../data/local-storage';
import { BRIDGE_VERSION } from '../shared/bridge-types';
import type { BridgeMsgDisconnect, BridgeMsgAuth } from '../shared/bridge-types';

let clerk: ClerkInstance | null = null;

declare global {
  interface Window {
    __BB_MOCK_CLERK__?: ClerkInstance;
  }
}

/**
 * Inject the Clerk CDN script with data-clerk-publishable-key.
 * The browser may already have the file cached thanks to the <link rel="preload"> in index.html.
 * After execution, Clerk auto-creates an instance on window.Clerk — we poll for it
 * in case auto-init is async.
 */
function loadClerkScript(publishableKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.clerkPublishableKey = publishableKey;
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';

    script.addEventListener('load', () => {
      // Auto-init may use microtasks — poll until window.Clerk is set
      const start = Date.now();
      const check = () => {
        if ((window as any).Clerk) {
          resolve();
        } else if (Date.now() - start > 10000) {
          reject(new Error('Clerk not available on window after 10s'));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });

    script.addEventListener('error', () =>
      reject(new Error('Failed to load Clerk from CDN'))
    );

    document.head.appendChild(script);
  });
}

export async function initClerk(): Promise<ClerkInstance | null> {
  try {
    if (import.meta.env.DEV && window.__BB_MOCK_CLERK__) {
      clerk = window.__BB_MOCK_CLERK__;
      if (clerk.user) {
        mountUserButton();
      }
      return clerk;
    }

    // Try Vite env var first (Vercel/production), fall back to Express API (local dev)
    let publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

    if (!publishableKey) {
      try {
        const res = await fetch('/api/config');
        const config = await res.json();
        publishableKey = config.clerkPublishableKey;
      } catch {
        // Express backend not available (e.g. Vercel deployment)
      }
    }

    if (!publishableKey) {
      console.log('[Auth] No Clerk key configured - running without auth');
      return null;
    }

    console.log('[Auth] Loading Clerk SDK from CDN...');
    await loadClerkScript(publishableKey);

    // With data-clerk-publishable-key, window.Clerk is the auto-created instance
    clerk = (window as any).Clerk;
    if (!clerk) {
      throw new Error('Clerk instance not available after script load');
    }

    console.log('[Auth] Clerk instance ready, calling load()...');
    await clerk.load();

    console.log('[Auth] Clerk loaded, user:', clerk.user ? 'signed in' : 'not signed in');

    if (clerk.user) {
      console.log('[Auth] User:', clerk.user.primaryEmailAddress?.emailAddress);
      mountUserButton();
    } else {
      console.log('[Auth] Showing sign-in overlay');
      showSignInOverlay({ showLocalEscape: true });
    }

    // Listen for user sign-in/sign-out events
    clerk.addListener(({ user }) => {
      if (user) {
        removeSignInOverlay();
        mountUserButton();
        if (_signInResolve) {
          _signInResolve(true);
          _signInResolve = null;
        }
      } else {
        // User signed out — notify extension to clear auth state
        const msg: BridgeMsgDisconnect = { type: 'BB_EXT_DISCONNECT', v: BRIDGE_VERSION };
        window.postMessage(msg, window.location.origin);
      }
    });

    return clerk;
  } catch (err) {
    console.error('[Auth] Error:', err);
    return null;
  }
}

function mountUserButton(): void {
  if (!clerk) return;

  // Mount to both desktop and mobile avatar containers
  const targets = ['clerk-user-button', 'mobile-avatar-btn'];
  for (const id of targets) {
    const container = document.getElementById(id) as HTMLDivElement | null;
    if (!container) continue;
    container.innerHTML = '';
    clerk.mountUserButton(container, { afterSignOutUrl: '/' });

    // Overlay custom avatar when user hasn't uploaded a profile photo
    if (!clerk.user?.hasImage) {
      container.classList.add('no-custom-avatar');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 512 512');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('default-avatar-overlay');
      svg.innerHTML =
        '<rect class="avatar-bg" width="512" height="512"/>' +
        '<rect class="avatar-shape" x="189.69" y="97.61" width="132.63" height="113.62"/>' +
        '<rect class="avatar-shape" x="110.55" y="225.59" width="290.89" height="188.81"/>';
      container.appendChild(svg);
    }
  }
}

// Resolvers for sign-in completion (used by triggerSignIn)
let _signInResolve: ((signedIn: boolean) => void) | null = null;
let _escapeKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function dismissSignInOverlay(): void {
  // Only act if the overlay is actually showing
  if (!document.getElementById('auth-overlay')) return;
  setAppMode('local');
  removeSignInOverlay();
  if (_signInResolve) {
    _signInResolve(false);
    _signInResolve = null;
  }
}

function showSignInOverlay(options?: { showLocalEscape?: boolean }): void {
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.classList.add('auth-overlay');

  const signInContainer = document.createElement('div');
  signInContainer.id = 'clerk-sign-in';
  overlay.appendChild(signInContainer);

  if (options?.showLocalEscape) {
    const escapeBtn = document.createElement('button');
    escapeBtn.textContent = 'Use locally instead';
    escapeBtn.classList.add('auth-escape-btn');
    escapeBtn.addEventListener('click', dismissSignInOverlay);
    overlay.appendChild(escapeBtn);
  }

  // Escape key dismisses the overlay (cleaned up in removeSignInOverlay)
  _escapeKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismissSignInOverlay();
  };
  document.addEventListener('keydown', _escapeKeyHandler);

  document.body.appendChild(overlay);

  if (clerk) {
    clerk.mountSignIn(signInContainer, {
      fallbackRedirectUrl: window.location.origin,
    });
  }
}

function removeSignInOverlay(): void {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.remove();
  // Clean up Escape key listener so it doesn't leak after sign-in
  if (_escapeKeyHandler) {
    document.removeEventListener('keydown', _escapeKeyHandler);
    _escapeKeyHandler = null;
  }
}

/**
 * Trigger sign-in flow. Returns true if user ends up signed in.
 * Used by upgradeToSync() for local→sync migration.
 */
export async function triggerSignIn(): Promise<boolean> {
  // Already signed in
  if (clerk?.user) return true;

  // Clerk not loaded yet — init it first
  if (!clerk) {
    const result = await initClerk();
    return !!result?.user;
  }

  // Clerk loaded but user not signed in — show overlay and wait
  return new Promise<boolean>((resolve) => {
    _signInResolve = resolve;
    showSignInOverlay({ showLocalEscape: true });
  });
}

export async function getAuthToken(options?: { template?: string }): Promise<string | null> {
  if (!clerk?.session) return null;
  try {
    return await clerk.session.getToken(options);
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  return clerk?.user || null;
}

export function getClerkInstance(): ClerkInstance | null {
  return clerk;
}

// --- Browser extension auth bridge ---

/**
 * Send a fresh Convex JWT to the browser extension (if installed).
 * The extension's content script listens for BB_EXT_AUTH messages via postMessage.
 */
async function sendTokenToExtension(): Promise<void> {
  if (!clerk?.session) return;
  try {
    const token = await clerk.session.getToken({ template: 'convex' });
    if (token) {
      const msg: BridgeMsgAuth = { type: 'BB_EXT_AUTH', v: BRIDGE_VERSION, token };
      window.postMessage(msg, window.location.origin);
    }
  } catch {
    // Silently ignore — extension may not be installed
  }
}

/**
 * Start listening for extension token requests and auto-send on login.
 * Called once after Clerk initializes with an authenticated user.
 */
let _bridgeInitialized = false;

export function initExtensionBridge(): void {
  if (_bridgeInitialized) return;
  _bridgeInitialized = true;

  // Send token immediately (extension content script may already be waiting)
  sendTokenToExtension();

  // Listen for explicit token requests from the extension content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'BB_EXT_REQUEST_TOKEN') {
      sendTokenToExtension();
    }
  });
}
