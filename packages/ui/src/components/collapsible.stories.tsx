import type { Meta, StoryObj } from '@storybook/react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible';
import { Button } from './button';

const meta = { title: 'Components/Collapsible', component: Collapsible } satisfies Meta<typeof Collapsible>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline">Toggle</Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded border p-2">Hidden content</div>
      </CollapsibleContent>
    </Collapsible>
  )
};

