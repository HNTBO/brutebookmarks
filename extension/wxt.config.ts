import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Brute Bookmarks',
    description: 'Quick-save any page to Brute Bookmarks with one click.',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['https://*.convex.cloud/*'],
  },
});
