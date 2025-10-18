import type { Meta, StoryObj } from '@storybook/react';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from './command';

const meta = { title: 'Components/Command', component: Command } satisfies Meta<typeof Command>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <div className="w-[360px] border rounded-md overflow-hidden">
      <Command>
        <CommandInput placeholder="Search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem>Calendar</CommandItem>
            <CommandItem>Search Emoji</CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Settings">
            <CommandItem>Profile</CommandItem>
            <CommandItem>Themes</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
};

