import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Grid, List, Calendar } from 'lucide-react';
import { SegmentedControl } from '../src/components/SegmentedControl';

const meta: Meta<typeof SegmentedControl> = {
  title: 'Components/SegmentedControl',
  component: SegmentedControl,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
};

export default meta;

type Story = StoryObj<typeof SegmentedControl>;

export const Playground: Story = {
  render: () => {
    const [value, setValue] = useState('grid');

    return (
      <SegmentedControl
        items={[
          { value: 'grid', label: 'Grid', icon: <Grid className="w-4 h-4" /> },
          { value: 'list', label: 'List', icon: <List className="w-4 h-4" /> },
          { value: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" /> },
        ]}
        value={value}
        onChange={setValue}
        size="md"
      />
    );
  },
};
