import { ConvexHttpClient } from 'convex/browser';
import { extensionAuth } from './extension-auth';

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

let client: ConvexHttpClient | null = null;

export function getClient(): ConvexHttpClient {
  if (!client) {
    client = new ConvexHttpClient(CONVEX_URL);
  }
  return client;
}

export function setAuthToken(token: string | null): void {
  const c = getClient();
  if (token) {
    c.setAuth(token);
  } else {
    c.clearAuth();
  }
}

export async function runAuthenticatedRequest<T>(
  request: (client: ConvexHttpClient) => Promise<T>,
): Promise<T> {
  const token = await extensionAuth.getValidConvexToken();
  if (!token) throw new Error('Extension authentication is unavailable.');
  setAuthToken(token);

  try {
    return await request(getClient());
  } catch (error) {
    if (!isAuthenticationError(error)) throw error;

    const refreshedToken = await extensionAuth.refreshConvexToken();
    if (!refreshedToken) throw error;
    setAuthToken(refreshedToken);
    return await request(getClient());
  }
}

function isAuthenticationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unauthenticated|not authenticated|authentication|invalid.*token|expired.*token|jwt/i.test(message);
}
