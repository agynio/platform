import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import tailwind from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import tsconfigPaths from 'vite-tsconfig-paths';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-interactions', '@storybook/addon-themes'],
  framework: { name: '@storybook/react-vite', options: {} },
  docs: { autodocs: true },
  viteFinal: async (baseConfig) => {
    return mergeConfig(baseConfig, {
      plugins: [tsconfigPaths()],
      css: {
        // Defensive: ensure PostCSS plugins apply in Storybook
        postcss: {
          // Tailwind v4 PostCSS plugin + autoprefixer
          plugins: [tailwind(), autoprefixer()]
        }
      },
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
