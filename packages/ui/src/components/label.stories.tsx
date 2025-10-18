import type { Meta, StoryObj } from '@storybook/react';
import { Label } from './label';

const meta = { title: 'Components/Label', component: Label } satisfies Meta<typeof Label>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = { render: () => <Label htmlFor="x">Label</Label> };

