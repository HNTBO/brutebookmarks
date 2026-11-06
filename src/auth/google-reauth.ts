// Type-only — erased at compile time
type ClerkInstance = import('@clerk/clerk-js').Clerk;

import { getItem, removeItem, setItem } from '../data/local-storage';

/**
 * Silent Google re-sign-in.
 *
 * Clerk's Hobby plan caps every session at 7 days, so each browser is signed
 * out weekly. For people who sign in with Google, we ask Google Identity
 * Services for a credential with auto_select on: a returning user is signed
 * back in without clicking anything. Clerk's own One Tap component hard-codes
 * auto_select off, which is why this talks to Google directly and only hands
 * the credential to Clerk's public authenticateWithGoogleOneTap API.
 *
 * Only browsers that previously signed in with Google try this, and a
 * deliberate sign-out turns it off until the next Google sign-in.
 */

const REAUTH_KEY = 'googleReauth';
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const GSI_LOAD_TIMEOUT_MS = 10000;

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
    itp_support: boolean;
    use_fedcm_for_prompt: boolean;
  }): void;
  prompt(): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

/** Remember that this browser signs in with Google, so expiry can be bridged. */
export function rememberGoogleSignIn(clerk: ClerkInstance): void {
  const usesGoogle = clerk.user?.externalAccounts.some((account) => account.provider === 'google');
  if (usesGoogle) setItem(REAUTH_KEY, true);
}

/** Make a deliberate sign-out stick: no automatic Google sign-in afterwards. */
export function guardSignOut(clerk: ClerkInstance): void {
  const signOut = clerk.signOut.bind(clerk);
  clerk.signOut = ((...args: Parameters<typeof signOut>) => {
    removeItem(REAUTH_KEY);
    window.google?.accounts.id.disableAutoSelect();
    return signOut(...args);
  }) as typeof clerk.signOut;
}

/**
 * Ask Google for a returning-user credential and exchange it for a Clerk
 * session. Does nothing unless this browser previously signed in with Google.
 * On success, Clerk's listeners fire as for any other sign-in.
 */
export async function tryGoogleReauth(clerk: ClerkInstance): Promise<void> {
  if (!getItem(REAUTH_KEY, false)) return;

  const clientId = clerk.__unstable__environment?.displayConfig.googleOneTapClientId;
  if (!clientId) return;

  const google = await loadGoogleIdentityServices();
  if (!google) return;

  google.accounts.id.initialize({
    client_id: clientId,
    auto_select: true,
    cancel_on_tap_outside: false,
    itp_support: true,
    use_fedcm_for_prompt: true,
    callback: async ({ credential }) => {
      try {
        const result = await clerk.authenticateWithGoogleOneTap({ token: credential });
        // Only resume existing accounts; never create one from a background prompt.
        const isSignIn = 'identifier' in result;
        if (isSignIn && result.status === 'complete' && result.createdSessionId) {
          await clerk.setActive({ session: result.createdSessionId });
        }
      } catch (err) {
        console.warn('[Auth] Google re-sign-in failed:', err);
      }
    },
  });
  google.accounts.id.prompt();
}

function loadGoogleIdentityServices(): Promise<Window['google'] | null> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    const timer = setTimeout(() => resolve(null), GSI_LOAD_TIMEOUT_MS);
    script.addEventListener('load', () => {
      clearTimeout(timer);
      resolve(window.google?.accounts?.id ? window.google : null);
    });
    script.addEventListener('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    document.head.appendChild(script);
  });
}
