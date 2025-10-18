import type { Meta, StoryObj } from '@storybook/react';
import { ChartContainer } from './chart';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const meta = { title: 'Components/Chart', component: ChartContainer } satisfies Meta<typeof ChartContainer>;
export default meta;
export type Story = StoryObj<typeof meta>;

const data = [
  { name: 'Jan', uv: 400 },
  { name: 'Feb', uv: 300 },
  { name: 'Mar', uv: 200 }
];

export const Basic: Story = {
  render: () => (
    <ChartContainer height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="uv" stroke="#3B82F6" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  )
};

