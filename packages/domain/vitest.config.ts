import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@repo/infrastructure/db/schema.js',
        replacement: fileURLToPath(new URL('../infrastructure/src/db/schema.ts', import.meta.url)),
      },
      {
        find: '@repo/infrastructure/db/index.js',
        replacement: fileURLToPath(new URL('../infrastructure/src/db/index.ts', import.meta.url)),
      },
      {
        find: /^@repo\/infrastructure$/,
        replacement: fileURLToPath(new URL('../infrastructure/src/index.ts', import.meta.url)),
      },
      {
        find: /^@repo\/on-chain$/,
        replacement: fileURLToPath(new URL('../on-chain/src/index.ts', import.meta.url)),
      },
    ],
  },
});
