import type { Meta, StoryObj } from '@storybook/react';
import { Toggle } from './toggle';

const meta = { title: 'Components/Toggle', component: Toggle } satisfies Meta<typeof Toggle>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => <Toggle aria-label="Toggle bold">Bold</Toggle>
};

