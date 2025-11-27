import type { Meta, StoryObj } from '@storybook/react';
import { DatePicker } from './date-picker';
import * as React from 'react';

const meta: Meta<typeof DatePicker> = {
  title: 'Components/DatePicker',
  component: DatePicker,
};
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {},
  render: (args) => {
    const [date, setDate] = React.useState<Date | undefined>();
    return <DatePicker {...args} date={date} onChange={setDate} />;
  },
};
