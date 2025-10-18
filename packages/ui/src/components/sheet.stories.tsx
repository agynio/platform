import type { Meta, StoryObj } from '@storybook/react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from './sheet';
import { Button } from './button';

const meta = { title: 'Components/Sheet', component: SheetContent } satisfies Meta<typeof SheetContent>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sheet title</SheetTitle>
          <SheetDescription>Sheet description</SheetDescription>
        </SheetHeader>
        <div className="mt-4">Sheet content…</div>
      </SheetContent>
    </Sheet>
  )
};

