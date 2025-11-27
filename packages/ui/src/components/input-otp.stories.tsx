import type { Meta, StoryObj } from '@storybook/react';
import { InputOTP, InputOTPSlot, InputOTPSeparator } from './input-otp';

const meta = { title: 'Components/InputOTP', component: InputOTP } satisfies Meta<typeof InputOTP>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    maxLength: 6,
    containerClassName: '',
    children: [
      <InputOTPSlot key={0} index={0} />,
      <InputOTPSlot key={1} index={1} />,
      <InputOTPSlot key={2} index={2} />,
      <InputOTPSeparator key="sep" />,
      <InputOTPSlot key={3} index={3} />,
      <InputOTPSlot key={4} index={4} />,
      <InputOTPSlot key={5} index={5} />,
    ],
  },
  render: (args) => <InputOTP {...args} />,
};
