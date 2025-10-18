import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from './textarea';

const meta = { title: 'Components/Textarea', component: Textarea, args: { placeholder: 'Type here' } } satisfies Meta<typeof Textarea>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

