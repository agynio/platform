import type { Meta, StoryObj } from '@storybook/react';
import { Panel, PanelHeader, PanelBody, PanelFooter } from '../src/components/Panel';
import { Button } from '../src/components/Button';

const meta: Meta<typeof Panel> = {
  title: 'Components/Panel',
  component: Panel,
  parameters: {
    layout: 'centered',
    tags: ['autodocs'],
  },
  argTypes: {
    variant: {
      control: 'select',
      options: ['standard', 'elevated'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof Panel>;

export const Playground: Story = {
  args: {
    variant: 'standard',
    className: 'max-w-xl',
    children: (
      <>
        <PanelHeader>
          <h3>Panel title</h3>
        </PanelHeader>
        <PanelBody>Panel body content</PanelBody>
      </>
    ),
  },
};

export const Variants: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
      <Panel variant="standard">
        <PanelHeader>
          <h3>Standard Panel</h3>
        </PanelHeader>
        <PanelBody>
          Basic container with border and subtle shadow.
        </PanelBody>
      </Panel>
      <Panel variant="elevated">
        <PanelHeader>
          <h3>Elevated Panel</h3>
        </PanelHeader>
        <PanelBody>
          More prominent panel for primary content.
        </PanelBody>
      </Panel>
    </div>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Panel variant="elevated" className="max-w-xl">
      <PanelHeader>
        <h3>Profile Settings</h3>
      </PanelHeader>
      <PanelBody>
        Update your profile details and notification preferences.
      </PanelBody>
      <PanelFooter>
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost">Cancel</Button>
          <Button variant="primary">Save changes</Button>
        </div>
      </PanelFooter>
    </Panel>
  ),
};
