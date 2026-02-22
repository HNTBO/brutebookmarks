import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'BruteBookmarks',
    description: 'Quick-save any page to Brute Bookmarks with one click.',
    permissions: ['activeTab', 'storage', 'bookmarks'],
    host_permissions: ['https://*.convex.cloud/*'],
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
  },
});
