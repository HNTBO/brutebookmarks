// Type-only — erased at compile time
type ClerkInstance = import('@clerk/clerk-js').Clerk;

let clerk: ClerkInstance | null = null;

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
    const res = await fetch('/api/config');
    const config = await res.json();

    if (!config.clerkPublishableKey) {
      console.log('[Auth] No Clerk key configured - running without auth');
      return null;
    }

    console.log('[Auth] Loading Clerk SDK from CDN...');
    await loadClerkScript(config.clerkPublishableKey);

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
      showSignInOverlay();
    }

    return clerk;
  } catch (err) {
    console.error('[Auth] Error:', err);
    return null;
  }
}

function mountUserButton(): void {
  const container = document.getElementById('clerk-user-button') as HTMLDivElement | null;
  if (container && clerk) {
    clerk.mountUserButton(container, { afterSignOutUrl: '/' });
  }
}

function showSignInOverlay(): void {
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
      fallbackRedirectUrl: window.location.origin,
    });
  }
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
      window.postMessage({ type: 'BB_EXT_AUTH', token }, '*');
    }
  } catch {
    // Silently ignore — extension may not be installed
  }
}

/**
 * Start listening for extension token requests and auto-send on login.
 * Called once after Clerk initializes with an authenticated user.
 */
export function initExtensionBridge(): void {
  // Send token immediately (extension content script may already be waiting)
  sendTokenToExtension();

  // Listen for explicit token requests from the extension content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'BB_EXT_REQUEST_TOKEN') {
      sendTokenToExtension();
    }
  });
}
