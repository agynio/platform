import type { Preview } from '@storybook/react';
import React from 'react';
import '../.storybook/preview.css';
import { Toaster } from '../src/components/toaster';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/ }
    },
    docs: { autodocs: true },
    themes: {
      clearable: false,
      target: 'html',
      list: [
        { name: 'Light', class: 'light', color: '#ffffff', default: true },
        { name: 'Dark', class: 'dark', color: '#0F172A' }
      ]
    },
    backgrounds: { disable: true }
  },
  decorators: [
    (Story) => (
      <>
        <Toaster />
        <Story />
      </>
    )
  ]
};

export default preview;

