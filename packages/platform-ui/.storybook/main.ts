import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

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
  async viteFinal(config) {
    return {
      ...config,
      resolve: {
        ...(config.resolve ?? {}),
        alias: {
          ...(config.resolve?.alias ?? {}),
          '@storybook/react/dist/entry-preview.mjs': '@storybook/react/entry-preview',
          '@storybook/react/dist/entry-preview.js': '@storybook/react/entry-preview',
          '@storybook/preview-api': 'storybook/internal/preview-api',
          '@storybook/react/dist/entry-preview-docs.mjs': '@storybook/react/entry-preview-docs',
          '@storybook/react/dist/entry-preview-docs.js': '@storybook/react/entry-preview-docs',
          '@storybook/react/dist/entry-preview-argtypes.mjs': '@storybook/react/entry-preview-argtypes',
          '@storybook/react/dist/entry-preview-argtypes.js': '@storybook/react/entry-preview-argtypes',
          '@storybook/react/dist/entry-preview-rsc.mjs': '@storybook/react/entry-preview-rsc',
          '@storybook/react/dist/entry-preview-rsc.js': '@storybook/react/entry-preview-rsc',
          '@storybook/addon-docs/dist/preview.js': '@storybook/addon-docs/preview',
          '@storybook/addon-docs/dist/preview.mjs': '@storybook/addon-docs/preview',
          '@storybook/addon-a11y/dist/preview.js': '@storybook/addon-a11y/preview',
          '@storybook/addon-a11y/dist/preview.mjs': '@storybook/addon-a11y/preview',
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
