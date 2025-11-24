import type { Meta, StoryObj } from '@storybook/react';
import Sidebar from '../src/components/Sidebar';

const meta: Meta<typeof Sidebar> = {
  title: 'Layouts/MainLayout/Sidebar',
  component: Sidebar,
  parameters: {
    layout: 'fullscreen',
    tags: ['autodocs'],
  },
};

export default meta;

type Story = StoryObj<typeof Sidebar>;

export const Playground: Story = {
  args: {
    currentUser: {
      name: 'John Developer',
      email: 'john@agyn.io',
    },
    selectedMenuItem: 'graph',
  },
};
