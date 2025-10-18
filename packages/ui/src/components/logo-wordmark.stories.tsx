import type { Meta, StoryObj } from '@storybook/react';
import { LogoWordmark } from './logo-wordmark';

const meta = {
  title: 'Components/Logo Wordmark',
  component: LogoWordmark,
  args: { variant: 'primary' as const }
} satisfies Meta<typeof LogoWordmark>;

export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

