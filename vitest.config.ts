import path from 'path';
import { defineConfig } from 'vitest/config';

if (!process.stdout.isTTY && process.argv.some((arg) => /^(-w|--watch)(=|$)/.test(arg))) {
  console.error('Vitest watch mode cannot run without a TTY.');
  process.exit(1);
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Look for tests anywhere under packages/*
    include: ['**/__tests__/**/*.test.ts'],
    hookTimeout: 60000,
    coverage: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'packages/platform-ui/src'),
      '@agyn/ui': path.resolve(__dirname, 'packages/ui/src'),
      // Tracing packages removed; no alias needed.
    },
  },
  server: {
    fs: {
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, 'packages/ui'),
      ],
    },
  },
});
