import type { Meta, StoryObj } from '@storybook/react';
import { Avatar, AvatarImage, AvatarFallback } from './avatar';

const meta = { title: 'Components/Avatar', component: Avatar } satisfies Meta<typeof Avatar>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="https://i.pravatar.cc/100" alt="avatar" />
      <AvatarFallback>AB</AvatarFallback>
    </Avatar>
  )
};

