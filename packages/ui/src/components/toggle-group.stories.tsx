import type { Meta, StoryObj } from '@storybook/react';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

const meta = { title: 'Components/ToggleGroup', component: ToggleGroup } satisfies Meta<typeof ToggleGroup>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    type: 'single',
    defaultValue: 'center',
    children: [
      <ToggleGroupItem key="left" value="left">Left</ToggleGroupItem>,
      <ToggleGroupItem key="center" value="center">Center</ToggleGroupItem>,
      <ToggleGroupItem key="right" value="right">Right</ToggleGroupItem>,
    ],
  },
  render: (args) => <ToggleGroup {...args} />,
};
