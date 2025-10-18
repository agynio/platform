import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from './switch';

const meta = { title: 'Components/Switch', component: Switch, args: { disabled: false } } satisfies Meta<typeof Switch>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

