import { defineConfig } from 'vitest/config';

if (!process.stdout.isTTY && process.argv.some((arg) => /^(-w|--watch)(=|$)/.test(arg))) {
  console.error('Vitest watch mode cannot run without a TTY.');
  process.exit(1);
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
<<<<<<< HEAD
    // Look for tests anywhere under packages/* (ts only in root)
=======
    // Look for tests anywhere under packages/*
>>>>>>> e30249f6 (test(platform-ui): standardize imports to '@/api/graph' and '@/api/tracing' across graph tests/hooks; wrap NodeObsSidebar filtering test in ObsUiProvider with serverUrl to satisfy context; adjust dynamic import paths to alias for consistency)
    include: ['**/__tests__/**/*.test.ts'],
    hookTimeout: 60000,
    coverage: {
      enabled: false,
    },
  },
});
