import type { Meta, StoryObj } from '@storybook/react';
import { InputOTP, InputOTPSlot, InputOTPSeparator } from './input-otp';

const meta = { title: 'Components/InputOTP', component: InputOTP } satisfies Meta<typeof InputOTP>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <InputOTP maxLength={6} containerClassName="">
      <InputOTPSlot index={0} />
      <InputOTPSlot index={1} />
      <InputOTPSlot index={2} />
      <InputOTPSeparator />
      <InputOTPSlot index={3} />
      <InputOTPSlot index={4} />
      <InputOTPSlot index={5} />
    </InputOTP>
  )
};
