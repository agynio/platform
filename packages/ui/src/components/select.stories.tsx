import type { Meta, StoryObj } from '@storybook/react';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from './select';

const meta = { title: 'Components/Select', component: Select } satisfies Meta<typeof Select>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Pick one" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="apple">Apple</SelectItem>
        <SelectItem value="banana">Banana</SelectItem>
        <SelectItem value="cherry">Cherry</SelectItem>
      </SelectContent>
    </Select>
  )
};

