// Type-only import — erased at compile time, no runtime code
type ClerkInstance = import('@clerk/clerk-js').Clerk;

let clerk: ClerkInstance | null = null;

/**
 * Load Clerk via CDN <script> tag instead of bundling.
 * The ~3MB npm bundle freezes the browser during parse even when code-split.
 * External <script> tags benefit from V8 streaming compilation while downloading.
 */
function loadClerkScript(publishableKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.clerkPublishableKey = publishableKey;
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Failed to load Clerk from CDN')));
    document.head.appendChild(script);
  });
}

export async function initClerk(): Promise<ClerkInstance | null> {
  try {
    // Get publishable key from backend
    const res = await fetch('/api/config');
    const config = await res.json();

    if (!config.clerkPublishableKey) {
      console.log('[Auth] No Clerk key configured - running without auth');
      return null;
    }

    console.log('[Auth] Loading Clerk SDK from CDN...');
    await loadClerkScript(config.clerkPublishableKey);

    // CDN build with data-clerk-publishable-key auto-creates instance on window.Clerk
    clerk = (window as any).Clerk ?? null;
    if (!clerk) {
      throw new Error('Clerk not available after script load');
    }

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
      afterSignInUrl: window.location.origin,
      afterSignUpUrl: window.location.origin,
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
