import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-interactions', '@storybook/addon-themes'],
  framework: { name: '@storybook/react-vite', options: {} },
  docs: { autodocs: true },
  viteFinal: async (baseConfig) => {
    return mergeConfig(baseConfig, {
      plugins: [tsconfigPaths()],
      resolve: {
        dedupe: ['react', 'react-dom']
      },
      optimizeDeps: {
        include: ['react', 'react-dom']
      }
    });
  }
};

export default config;

