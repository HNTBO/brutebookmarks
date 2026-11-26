import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

export default defineConfig({
  // Unit tests import extension sources before WXT has generated its tsconfigs.
  esbuild: { tsconfigRaw: readFileSync(new URL('./tsconfig.json', import.meta.url), 'utf8') },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
