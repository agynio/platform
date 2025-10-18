import type { Meta, StoryObj } from '@storybook/react';
import { Logo } from './logo';

const meta = {
  title: 'Components/Logo',
  component: Logo,
  args: { size: 128, variant: 'light' as const },
  argTypes: {
    variant: { control: 'select', options: ['light', 'dark', 'gradient'] },
    size: { control: { type: 'number', min: 16, max: 512, step: 8 } }
  },
  parameters: {
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0F172A' }
      ]
    }
  }
} satisfies Meta<typeof Logo>;

export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

export const OnLightBackground: Story = {
  args: { variant: 'dark' }
};

export const OnDarkBackground: Story = {
  args: { variant: 'light' },
  parameters: { backgrounds: { default: 'dark' } }
};

export const GradientOnLight: Story = {
  args: { variant: 'gradient' }
};
