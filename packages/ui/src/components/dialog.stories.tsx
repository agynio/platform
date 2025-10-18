import type { Meta, StoryObj } from '@storybook/react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './dialog';
import { Button } from './button';

const meta = { title: 'Components/Dialog', component: DialogContent } satisfies Meta<typeof DialogContent>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Short description.</DialogDescription>
        </DialogHeader>
        <div className="mt-4">Dialog body content…</div>
      </DialogContent>
    </Dialog>
  )
};

