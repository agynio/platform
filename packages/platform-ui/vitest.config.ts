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
      '@agyn/ui': path.resolve(__dirname, '../../packages/ui/src'),
      // Explicit aliases for Radix UI deps when importing workspace UI sources
      '@radix-ui/react-accordion': path.resolve(__dirname, './node_modules/@radix-ui/react-accordion'),
      '@radix-ui/react-alert-dialog': path.resolve(__dirname, './node_modules/@radix-ui/react-alert-dialog'),
      '@radix-ui/react-aspect-ratio': path.resolve(__dirname, './node_modules/@radix-ui/react-aspect-ratio'),
      '@radix-ui/react-avatar': path.resolve(__dirname, './node_modules/@radix-ui/react-avatar'),
      '@radix-ui/react-checkbox': path.resolve(__dirname, './node_modules/@radix-ui/react-checkbox'),
      '@radix-ui/react-collapsible': path.resolve(__dirname, './node_modules/@radix-ui/react-collapsible'),
      '@radix-ui/react-context-menu': path.resolve(__dirname, './node_modules/@radix-ui/react-context-menu'),
      '@radix-ui/react-dialog': path.resolve(__dirname, './node_modules/@radix-ui/react-dialog'),
      '@radix-ui/react-dropdown-menu': path.resolve(__dirname, './node_modules/@radix-ui/react-dropdown-menu'),
      '@radix-ui/react-hover-card': path.resolve(__dirname, './node_modules/@radix-ui/react-hover-card'),
      '@radix-ui/react-menubar': path.resolve(__dirname, './node_modules/@radix-ui/react-menubar'),
      '@radix-ui/react-navigation-menu': path.resolve(__dirname, './node_modules/@radix-ui/react-navigation-menu'),
      '@radix-ui/react-popover': path.resolve(__dirname, './node_modules/@radix-ui/react-popover'),
      '@radix-ui/react-progress': path.resolve(__dirname, './node_modules/@radix-ui/react-progress'),
      '@radix-ui/react-radio-group': path.resolve(__dirname, './node_modules/@radix-ui/react-radio-group'),
      '@radix-ui/react-scroll-area': path.resolve(__dirname, './node_modules/@radix-ui/react-scroll-area'),
      '@radix-ui/react-select': path.resolve(__dirname, './node_modules/@radix-ui/react-select'),
      '@radix-ui/react-separator': path.resolve(__dirname, './node_modules/@radix-ui/react-separator'),
      '@radix-ui/react-slider': path.resolve(__dirname, './node_modules/@radix-ui/react-slider'),
      '@radix-ui/react-slot': path.resolve(__dirname, './node_modules/@radix-ui/react-slot'),
      '@radix-ui/react-switch': path.resolve(__dirname, './node_modules/@radix-ui/react-switch'),
      '@radix-ui/react-tabs': path.resolve(__dirname, './node_modules/@radix-ui/react-tabs'),
      '@radix-ui/react-toggle': path.resolve(__dirname, './node_modules/@radix-ui/react-toggle'),
      '@radix-ui/react-toggle-group': path.resolve(__dirname, './node_modules/@radix-ui/react-toggle-group'),
      '@radix-ui/react-tooltip': path.resolve(__dirname, './node_modules/@radix-ui/react-tooltip'),
      'lucide-react': path.resolve(__dirname, './node_modules/lucide-react'),
      'react-resizable-panels': path.resolve(__dirname, './node_modules/react-resizable-panels'),
      // Ensure subpackage TSX compiles in tests
      'react/jsx-dev-runtime': path.resolve(__dirname, './node_modules/react/jsx-dev-runtime.js'),
      react: path.resolve(__dirname, './node_modules/react/index.js'),
    },
  },
});
