import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './skeleton';

const meta = { title: 'Components/Skeleton', component: Skeleton } satisfies Meta<typeof Skeleton>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = { render: () => <Skeleton className="h-8 w-40" /> };

