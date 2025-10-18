import type { Meta, StoryObj } from '@storybook/react';
import { Alert, AlertDescription, AlertTitle } from './alert';

const meta = {
  title: 'Components/Alert',
  component: Alert,
  args: { variant: 'default' as const },
  argTypes: { variant: { control: 'select', options: ['default', 'destructive', 'success', 'warning'] } }
} satisfies Meta<typeof Alert>;

export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>This is an alert message.</AlertDescription>
    </Alert>
  )
};

