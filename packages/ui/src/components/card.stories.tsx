import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card';

const meta = {
  title: 'Components/Card',
  component: Card,
  args: { variant: 'standard' as const },
  argTypes: { variant: { control: 'select', options: ['standard', 'elevated', 'subtle', 'highlighted'] } }
} satisfies Meta<typeof Card>;

export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Card title</CardTitle>
        <CardDescription>Card description</CardDescription>
      </CardHeader>
      <CardContent>Some content</CardContent>
      <CardFooter>Footer</CardFooter>
    </Card>
  )
};

