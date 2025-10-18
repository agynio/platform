import type { Meta, StoryObj } from '@storybook/react';
import { Kbd } from './kbd';

const meta = { title: 'Components/Kbd', component: Kbd } satisfies Meta<typeof Kbd>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = { render: () => <Kbd>⌘K</Kbd> };

