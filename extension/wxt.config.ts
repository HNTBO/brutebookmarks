import { defineConfig } from 'wxt';

const DEFAULT_APP_ORIGIN = 'https://brutebookmarks.com';
const requestedVariant = process.env.BB_EXTENSION_VARIANT;
const extensionVariant =
  requestedVariant === 'newtab' || requestedVariant === 'newtab-native' || requestedVariant === 'newtab-hybrid'
    ? requestedVariant
    : 'quick-save';
const isNewTabVariant =
  extensionVariant === 'newtab' ||
  extensionVariant === 'newtab-native' ||
  extensionVariant === 'newtab-hybrid';
const isNativeNewTabVariant = extensionVariant === 'newtab-native';
const isHybridNewTabVariant = extensionVariant === 'newtab-hybrid';
const extensionIconBase = isNewTabVariant ? 'newtab-icon' : 'quicksave-icon';

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
  filterEntrypoints: extensionVariant === 'newtab'
    ? ['background', 'content', 'ntp']
    : extensionVariant === 'newtab-native'
      ? ['background', 'content', 'ntp-native']
      : extensionVariant === 'newtab-hybrid'
        ? ['background', 'content', 'ntp-hybrid']
      : ['background', 'content', 'popup'],
  outDirTemplate: extensionVariant === 'newtab'
    ? `newtab-redirect/{{browser}}-mv{{manifestVersion}}{{modeSuffix}}`
    : extensionVariant === 'newtab-native'
      ? `newtab-native/{{browser}}-mv{{manifestVersion}}{{modeSuffix}}`
      : extensionVariant === 'newtab-hybrid'
        ? `newtab-hybrid/{{browser}}-mv{{manifestVersion}}{{modeSuffix}}`
      : `{{browser}}-mv{{manifestVersion}}{{modeSuffix}}`,
  zip: {
    name: extensionVariant === 'newtab'
      ? 'brute-bookmarks-new-tab-redirect'
      : extensionVariant === 'newtab-native'
        ? 'brute-bookmarks-new-tab-native'
        : extensionVariant === 'newtab-hybrid'
          ? 'brute-bookmarks-new-tab-hybrid'
        : 'brute-bookmarks-quick-save',
  },
  manifest: ({ browser }) => {
    const crxPublicKey = isNativeNewTabVariant
      ? process.env.CRX_PUBLIC_KEY_NEWTAB_NATIVE
      : isHybridNewTabVariant
        ? process.env.CRX_PUBLIC_KEY_NEWTAB_HYBRID
      : isNewTabVariant
      ? process.env.CRX_PUBLIC_KEY_NEWTAB
      : process.env.CRX_PUBLIC_KEY;
    const clerkPublishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
    const clerkFrontendApi =
      process.env.VITE_CLERK_FRONTEND_API || decodeFrontendApiFromPublishableKey(clerkPublishableKey);
    const appOrigin = process.env.VITE_APP_URL || DEFAULT_APP_ORIGIN;
    const clerkSyncHost = process.env.VITE_CLERK_SYNC_HOST || appOrigin;

    const hostPermissions = new Set<string>(['https://*.convex.cloud/*']);
    const chromiumClerkEnabled = browser === 'chrome' && !!clerkPublishableKey;
    if (isHybridNewTabVariant) {
      const appPermission = normalizeHostPermission(appOrigin);
      if (appPermission) hostPermissions.add(appPermission);
    }
    if (chromiumClerkEnabled) {
      const frontendPermission = normalizeHostPermission(clerkFrontendApi);
      const syncHostPermission = normalizeHostPermission(clerkSyncHost);
      if (frontendPermission) hostPermissions.add(frontendPermission);
      if (syncHostPermission) hostPermissions.add(syncHostPermission);
    }

    return {
      name: extensionVariant === 'newtab'
        ? 'BruteBookmarks New Tab'
        : extensionVariant === 'newtab-native'
          ? 'BruteBookmarks Native New Tab'
          : extensionVariant === 'newtab-hybrid'
            ? 'BruteBookmarks Hybrid New Tab'
          : 'BruteBookmarks Quick Save',
      description: extensionVariant === 'newtab'
        ? 'Open the BruteBookmarks app from your new tab.'
        : extensionVariant === 'newtab-native'
          ? 'Replace your new tab with a native BruteBookmarks extension page.'
          : extensionVariant === 'newtab-hybrid'
            ? 'Open BruteBookmarks from your new tab with a native fallback when the app is unreachable.'
          : 'Quick-save any page to BruteBookmarks with one click.',
      ...(browser === 'chrome' && crxPublicKey ? { key: crxPublicKey } : {}),
      permissions: chromiumClerkEnabled
        ? ['storage', 'bookmarks', 'tabs', 'cookies']
        : ['storage', 'bookmarks', 'tabs'],
      host_permissions: Array.from(hostPermissions),
      icons: {
        16: `/${extensionIconBase}-16.png`,
        32: `/${extensionIconBase}-32.png`,
        48: `/${extensionIconBase}-48.png`,
        128: `/${extensionIconBase}-128.png`,
        300: `/${extensionIconBase}-300.png`,
      },
      action: {
        default_icon: {
          16: `/${extensionIconBase}-16.png`,
          32: `/${extensionIconBase}-32.png`,
          48: `/${extensionIconBase}-48.png`,
          128: `/${extensionIconBase}-128.png`,
        },
        ...(isNewTabVariant ? {} : { default_title: 'BruteBookmarks Quick Save' }),
      },
      ...(isNewTabVariant
        ? {
            chrome_url_overrides: {
              newtab: isNativeNewTabVariant
                ? 'ntp-native.html'
                : isHybridNewTabVariant
                  ? 'ntp-hybrid.html'
                  : 'ntp.html',
            },
          }
        : {}),
    };
  },
});
