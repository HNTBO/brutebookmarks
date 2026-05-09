import { ConvexHttpClient } from 'convex/browser';

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
