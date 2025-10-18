import type { Meta, StoryObj } from '@storybook/react';
import { DateRangePicker } from './date-range-picker';
import * as React from 'react';
import { enUS } from 'date-fns/locale';

const meta: Meta<typeof DateRangePicker> = {
  title: 'Components/DateRangePicker',
  component: DateRangePicker,
  args: { locale: enUS }
};
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => {
    const [value, setValue] = React.useState<any>();
    return <DateRangePicker value={value} onChange={setValue} />;
  }
};
