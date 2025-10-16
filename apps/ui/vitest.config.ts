import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  server: {
    fs: {
      // Allow importing workspace packages' source (packages/ui)
      allow: [
        // repo root
        path.resolve(__dirname, '../..'),
        // packages/ui
        path.resolve(__dirname, '../../packages/ui'),
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Ensure subpackage TSX compiles in tests
      'react/jsx-dev-runtime': path.resolve(__dirname, './node_modules/react/jsx-dev-runtime.js'),
      react: path.resolve(__dirname, './node_modules/react/index.js'),
    },
  },
});
