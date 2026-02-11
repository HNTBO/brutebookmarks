// Dynamic import — keeps the ~3MB Clerk bundle out of the main chunk
type ClerkInstance = import('@clerk/clerk-js').Clerk;

let clerk: ClerkInstance | null = null;

export async function initClerk(): Promise<ClerkInstance | null> {
  try {
    // Get publishable key from backend
    const res = await fetch('/api/config');
    const config = await res.json();

    if (!config.clerkPublishableKey) {
      console.log('[Auth] No Clerk key configured - running without auth');
      return null;
    }

    console.log('[Auth] Loading Clerk SDK...');
    const { Clerk } = await import('@clerk/clerk-js');
    clerk = new Clerk(config.clerkPublishableKey);
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
