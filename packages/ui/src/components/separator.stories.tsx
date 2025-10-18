import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from './separator';

const meta = { title: 'Components/Separator', component: Separator } satisfies Meta<typeof Separator>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Horizontal: Story = { render: () => <Separator /> };
export const Vertical: Story = { render: () => <div className="h-24"><Separator orientation="vertical" /></div> };

