import type { Meta, StoryObj } from '@storybook/react';
import { VirtualizedList } from '../src/components/VirtualizedList';

interface Item {
  id: number;
  label: string;
}

const items: Item[] = Array.from({ length: 200 }, (_, i) => ({
  id: i + 1,
  label: `Item ${i + 1}`,
}));

const meta: Meta<typeof VirtualizedList<Item>> = {
  title: 'Components/VirtualizedList',
  component: VirtualizedList,
  parameters: {
    layout: 'fullscreen',
    tags: ['autodocs'],
  },
};

export default meta;

type Story = StoryObj<typeof VirtualizedList<Item>>;

export const Basic: Story = {
  args: {
    items,
    renderItem: (index: number, item: Item) => (
      <div
        style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--agyn-border-subtle)',
        }}
      >
        {item.label}
      </div>
    ),
    getItemKey: (item: Item) => item.id,
    className: 'h-96',
  },
};
