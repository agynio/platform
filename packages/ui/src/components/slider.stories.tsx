import type { Meta, StoryObj } from '@storybook/react';
import { Slider } from './slider';

const meta = { title: 'Components/Slider', component: Slider, args: { min: 0, max: 100, defaultValue: [50] } } satisfies Meta<typeof Slider>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

