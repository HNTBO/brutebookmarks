import { defineConfig } from 'wxt';

const DEFAULT_APP_ORIGIN = 'https://brutebookmarks.com';
const PRODUCTION_CLERK_SYNC_HOST = 'https://clerk.brutebookmarks.com';

function normalizeHostPermission(value?: string | null): string | null {
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

function assertProductionChromiumAuthConfig(options: {
  browser: string;
  mode: string;
  crxPublicKey?: string;
  clerkPublishableKey?: string;
  clerkFrontendApi: string | null;
  clerkSyncHost: string;
}): void {
  if (options.browser !== 'chrome' || options.mode !== 'production') return;

  const missing = [
    !options.clerkPublishableKey && 'VITE_CLERK_PUBLISHABLE_KEY',
    !options.clerkFrontendApi && 'VITE_CLERK_FRONTEND_API',
    !options.clerkSyncHost && 'VITE_CLERK_SYNC_HOST',
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Production Chromium auth configuration is missing: ${missing.join(', ')}`);
  }

  if (!options.clerkPublishableKey?.startsWith('pk_live_')) {
    throw new Error('Production Chromium builds require a Clerk pk_live_ publishable key.');
  }

  if (options.clerkSyncHost !== PRODUCTION_CLERK_SYNC_HOST) {
    throw new Error(`Production Clerk Sync Host must be ${PRODUCTION_CLERK_SYNC_HOST}.`);
  }
}

export default defineConfig({
  srcDir: 'src',
  filterEntrypoints: ['background', 'content', 'ntp'],
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}{{modeSuffix}}',
  zip: {
    name: 'brute-bookmarks-new-tab',
  },
  manifest: ({ browser, mode }) => {
    const crxPublicKey = process.env.CRX_PUBLIC_KEY_NEWTAB;
    const clerkPublishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    const clerkFrontendApi =
      process.env.VITE_CLERK_FRONTEND_API || decodeFrontendApiFromPublishableKey(clerkPublishableKey);
    const appOrigin = process.env.VITE_APP_URL || DEFAULT_APP_ORIGIN;
    const clerkSyncHost = process.env.VITE_CLERK_SYNC_HOST || appOrigin;

    assertProductionChromiumAuthConfig({
      browser,
      mode,
      crxPublicKey,
      clerkPublishableKey,
      clerkFrontendApi,
      clerkSyncHost,
    });

    const hostPermissions = new Set<string>(['https://*.convex.cloud/*']);
    const appPermission = normalizeHostPermission(appOrigin);
    if (appPermission) hostPermissions.add(appPermission);

    const chromiumClerkEnabled = browser === 'chrome' && !!clerkPublishableKey;
    if (chromiumClerkEnabled) {
      const frontendPermission = normalizeHostPermission(clerkFrontendApi);
      const syncHostPermission = normalizeHostPermission(clerkSyncHost);
      if (frontendPermission) hostPermissions.add(frontendPermission);
      if (syncHostPermission) hostPermissions.add(syncHostPermission);
    }

    const permissions = chromiumClerkEnabled
      ? ['storage', 'bookmarks', 'tabs', 'cookies']
      : ['storage', 'bookmarks', 'tabs'];

    if (browser === 'chrome' && mode === 'production') {
      const requiredHostPermissions = [clerkFrontendApi, clerkSyncHost]
        .map(normalizeHostPermission)
        .filter((permission): permission is string => permission !== null);
      const missingHostPermissions = requiredHostPermissions.filter(
        (permission) => !hostPermissions.has(permission),
      );
      if (!permissions.includes('cookies') || missingHostPermissions.length > 0) {
        throw new Error('Production Chromium manifest is missing Clerk auth permissions.');
      }
    }

    return {
      name: 'BruteBookmarks New Tab',
      description: 'Open BruteBookmarks from your new tab with a cached fallback when the app is unreachable.',
      ...(browser === 'chrome' && crxPublicKey ? { key: crxPublicKey } : {}),
      permissions,
      host_permissions: Array.from(hostPermissions),
      icons: {
        16: '/cws-newtab-icon-16.png',
        32: '/cws-newtab-icon-32.png',
        48: '/cws-newtab-icon-48.png',
        128: '/cws-newtab-icon-128.png',
        300: '/cws-newtab-icon-300.png',
      },
      action: {
        default_icon: {
          16: '/newtab-icon-16.png',
          32: '/newtab-icon-32.png',
          48: '/newtab-icon-48.png',
          128: '/newtab-icon-128.png',
        },
      },
      chrome_url_overrides: {
        newtab: 'ntp.html',
      },
    };
  },
});
