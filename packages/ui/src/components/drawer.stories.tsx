import type { Meta, StoryObj } from '@storybook/react';
import { Drawer, DrawerTrigger, DrawerContent } from './drawer';
import { Button } from './button';

const meta = { title: 'Components/Drawer', component: DrawerContent } satisfies Meta<typeof DrawerContent>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button>Open drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mt-2">Drawer content</div>
      </DrawerContent>
    </Drawer>
  )
};

