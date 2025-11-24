import type { Meta, StoryObj } from '@storybook/react';
import VariablesScreen, { type Variable } from '../src/components/screens/VariablesScreen';
import { MainLayout } from '../src/components/layouts/MainLayout';

const meta: Meta<typeof VariablesScreen> = {
  title: 'Screens/Variables',
  component: VariablesScreen,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof VariablesScreen>;

const sampleVariables: Variable[] = [
  {
    id: 'var-1',
    key: 'OPENAI_API_KEY',
    graphValue: '${{ secrets.OPENAI_API_KEY }}',
    localValue: 'sk-***',
  },
  {
    id: 'var-2',
    key: 'ENV',
    graphValue: 'production',
    localValue: 'development',
  },
];

const manyVariables: Variable[] = Array.from({ length: 80 }).map((_, index) => {
  const id = index + 1;
  return {
    id: `var-${id}`,
    key: `SETTING_${id.toString().padStart(3, '0')}`,
    graphValue: `graph-value-${id}`,
    localValue: id % 5 === 0 ? '' : `local-override-${id}`,
  };
});

export const Default: Story = {
  render: (args) => (
    <MainLayout selectedMenuItem="variables">
      <VariablesScreen {...args} />
    </MainLayout>
  ),
  args: {
    variables: sampleVariables,
  },
};

export const ManyVariablesPagination: Story = {
  render: (args) => (
    <MainLayout selectedMenuItem="variables">
      <VariablesScreen {...args} />
    </MainLayout>
  ),
  args: {
    variables: manyVariables,
  },
};
