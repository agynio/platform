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
});
