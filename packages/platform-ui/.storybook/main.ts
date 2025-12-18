import path from 'path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: [
    '../stories/**/*.mdx',
    '../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-vitest',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  env: (existing) => ({
    ...existing,
    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? 'http://localhost:4173/api',
  }),
  async viteFinal(config) {
    const apiBase = process.env.VITE_API_BASE_URL ?? 'http://localhost:4173/api';
    return {
      ...config,
      define: {
        ...(config.define ?? {}),
        'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBase),
      },
      envPrefix: Array.from(new Set(['VITE_', 'STORYBOOK_', ...(config.envPrefix ?? [])])),
      resolve: {
        ...config.resolve,
        alias: {
          ...(config.resolve?.alias ?? {}),
          '@': path.resolve(dirname, '../src'),
          '@agyn/ui-new': path.resolve(dirname, '../ui-new/src'),
          'react/jsx-runtime': path.resolve(dirname, '../node_modules/react/jsx-runtime.js'),
          'react/jsx-dev-runtime': path.resolve(
            dirname,
            '../node_modules/react/jsx-dev-runtime.js'
          ),
          react: path.resolve(dirname, '../node_modules/react/index.js'),
        },
      },
      plugins: [
        ...(config.plugins ?? []), //
        tailwindcss(),
      ],
    };
  },
};
export default config;
