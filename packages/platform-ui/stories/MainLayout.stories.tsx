import type { Meta, StoryObj } from '@storybook/react';
import { MainLayout } from '../src/components/layouts/MainLayout';

const meta: Meta<typeof MainLayout> = {
  title: 'Layouts/MainLayout',
  component: MainLayout,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof MainLayout>;

export const Default: Story = {
  render: () => (
    <MainLayout>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[var(--agyn-gray)]">Page content goes here</p>
      </div>
    </MainLayout>
  ),
};
