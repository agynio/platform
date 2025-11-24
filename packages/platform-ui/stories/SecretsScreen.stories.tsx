import type { Meta, StoryObj } from '@storybook/react';
import SecretsScreen, { type Secret } from '../src/components/screens/SecretsScreen';
import { MainLayout } from '../src/components/layouts/MainLayout';

const meta: Meta<typeof SecretsScreen> = {
  title: 'Screens/Secrets',
  component: SecretsScreen,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof SecretsScreen>;

const sampleSecrets: Secret[] = [
  {
    id: 'sec-1',
    key: 'OPENAI_API_KEY',
    value: 'sk-***',
    status: 'used',
  },
  {
    id: 'sec-2',
    key: 'SLACK_BOT_TOKEN',
    value: 'xoxb-***',
    status: 'missing',
  },
];

const manySecrets: Secret[] = Array.from({ length: 75 }).map((_, index) => {
  const id = index + 1;
  return {
    id: `sec-${id}`,
    key: `SERVICE_${id.toString().padStart(3, '0')}_API_KEY`,
    value: `sk-demo-${id.toString().padStart(6, '0')}`,
    status: id % 7 === 0 ? 'missing' : 'used',
  };
});

export const Default: Story = {
  render: (args) => (
    <MainLayout selectedMenuItem="secrets">
      <SecretsScreen {...args} />
    </MainLayout>
  ),
  args: {
    secrets: sampleSecrets,
  },
};

export const ManySecretsPagination: Story = {
  render: (args) => (
    <MainLayout selectedMenuItem="secrets">
      <SecretsScreen {...args} />
    </MainLayout>
  ),
  args: {
    secrets: manySecrets,
  },
};
