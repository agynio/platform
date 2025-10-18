import type { Meta, StoryObj } from '@storybook/react';
import { Calendar, type CalendarProps } from './calendar';
import { enUS } from 'date-fns/locale';

const meta = {
  title: 'Components/Calendar',
  component: Calendar,
  args: { locale: enUS } as Partial<CalendarProps>,
  argTypes: {
    locale: { control: false }
  }
} satisfies Meta<typeof Calendar>;

export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = { args: {} };

