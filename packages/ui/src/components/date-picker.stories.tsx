import type { Meta, StoryObj } from '@storybook/react';
import { DatePicker } from './date-picker';
import * as React from 'react';
import { enUS } from 'date-fns/locale';

const meta: Meta<typeof DatePicker> = {
  title: 'Components/DatePicker',
  component: DatePicker,
  args: { locale: enUS }
};
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date | undefined>();
    return <DatePicker date={date} onChange={setDate} />;
  }
};
