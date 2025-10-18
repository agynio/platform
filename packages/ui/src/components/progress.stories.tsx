import type { Meta, StoryObj } from '@storybook/react';
import { Progress } from './progress';

const meta = { title: 'Components/Progress', component: Progress, args: { value: 33 } } satisfies Meta<typeof Progress>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

