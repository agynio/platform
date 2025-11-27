import type { Meta, StoryObj } from '@storybook/react';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';

const meta = { title: 'Components/Accordion', component: Accordion } satisfies Meta<typeof Accordion>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: { type: 'single', collapsible: true, className: 'w-full max-w-md' },
  render: (args) => (
    <Accordion {...args}>
      <AccordionItem value="item-1">
        <AccordionTrigger>Item 1</AccordionTrigger>
        <AccordionContent>Content for item 1</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Item 2</AccordionTrigger>
        <AccordionContent>Content for item 2</AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};
