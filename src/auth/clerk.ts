// Type-only import — erased at compile time, zero runtime cost
type ClerkInstance = import('@clerk/clerk-js').Clerk;

let clerk: ClerkInstance | null = null;

/**
 * Wait for the Clerk CDN script (already in index.html <head>) to finish loading.
 * Because the script is `async`, it downloads in parallel with our app bundle.
 * By the time this runs, the script is usually already parsed and ready.
 */
function waitForClerkScript(): Promise<void> {
  // Already loaded?
  if ((window as any).Clerk) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.getElementById('clerk-script');
    if (!script) {
      reject(new Error('Clerk <script id="clerk-script"> not found in index.html'));
      return;
    }

    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Clerk CDN script failed to load')));

    // Re-check in case it loaded between our first check and adding the listener
    if ((window as any).Clerk) resolve();
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

    console.log('[Auth] Waiting for Clerk SDK...');
    await waitForClerkScript();

    // Without data-clerk-publishable-key, window.Clerk is the constructor
    const ClerkConstructor = (window as any).Clerk;
    if (!ClerkConstructor) {
      throw new Error('Clerk constructor not available after script load');
    }

    console.log('[Auth] Instantiating Clerk...');
    clerk = new ClerkConstructor(config.clerkPublishableKey);
    await clerk!.load();

    console.log('[Auth] Clerk loaded, user:', clerk!.user ? 'signed in' : 'not signed in');

    if (clerk!.user) {
      console.log('[Auth] User:', clerk!.user.primaryEmailAddress?.emailAddress);
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
