import { defineConfig } from 'wxt';

const DEFAULT_APP_ORIGIN = 'https://brutebookmarks.com';

function normalizeHostPermission(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return `${trimmed.replace(/\/+$/, '')}/*`;
}

function decodeFrontendApiFromPublishableKey(key?: string): string | null {
  if (!key) return null;
  const encoded = key.split('_').slice(2).join('_');
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
    if (!decoded) return null;
    return `https://${decoded}`;
  } catch {
    return null;
  }
}

export default defineConfig({
  srcDir: 'src',
  manifest: ({ browser }) => {
    const crxPublicKey = process.env.CRX_PUBLIC_KEY;
    const clerkPublishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    const clerkFrontendApi =
      process.env.VITE_CLERK_FRONTEND_API || decodeFrontendApiFromPublishableKey(clerkPublishableKey);
    const appOrigin = process.env.VITE_APP_URL || DEFAULT_APP_ORIGIN;
    const clerkSyncHost = process.env.VITE_CLERK_SYNC_HOST || appOrigin;

    const hostPermissions = new Set<string>(['https://*.convex.cloud/*']);
    const chromiumClerkEnabled = browser === 'chrome' && !!clerkPublishableKey;
    if (chromiumClerkEnabled) {
      const frontendPermission = normalizeHostPermission(clerkFrontendApi);
      const syncHostPermission = normalizeHostPermission(clerkSyncHost);
      if (frontendPermission) hostPermissions.add(frontendPermission);
      if (syncHostPermission) hostPermissions.add(syncHostPermission);
    }

    return {
      name: 'BruteBookmarks',
      description: 'Quick-save any page to BruteBookmarks with one click.',
      ...(browser === 'chrome' && crxPublicKey ? { key: crxPublicKey } : {}),
      permissions: chromiumClerkEnabled
        ? ['storage', 'bookmarks', 'tabs', 'cookies']
        : ['storage', 'bookmarks', 'tabs'],
      host_permissions: Array.from(hostPermissions),
      icons: {
        16: '/icon-16.png',
        32: '/icon-32.png',
        48: '/icon-48.png',
        128: '/icon-128.png',
      },
      action: {
        default_icon: {
          16: '/icon-16.png',
          32: '/icon-32.png',
          48: '/icon-48.png',
          128: '/icon-128.png',
        },
      },
    };
  },
});
