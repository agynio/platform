import type { Meta, StoryObj } from '@storybook/react';
import { DateRangePicker } from './date-range-picker';
import * as React from 'react';

const meta: Meta<typeof DateRangePicker> = {
  title: 'Components/DateRangePicker',
  component: DateRangePicker,
};
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
  render: (args) => {
    const [value, setValue] = React.useState<any>();
    return <DateRangePicker {...args} value={value} onChange={setValue} />;
  },
};
