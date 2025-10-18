import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './checkbox';

const meta = { title: 'Components/Checkbox', component: Checkbox, args: { disabled: false } } satisfies Meta<typeof Checkbox>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

