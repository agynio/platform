import type { Meta, StoryObj } from '@storybook/react';
import { Combobox } from './combobox';
import * as React from 'react';

const meta = { title: 'Components/Combobox', component: Combobox } satisfies Meta<typeof Combobox>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = React.useState<string | undefined>();
    return (
      <Combobox
        options={[
          { label: 'Apple', value: 'apple' },
          { label: 'Banana', value: 'banana' },
          { label: 'Cherry', value: 'cherry' }
        ]}
        value={value}
        onChange={(v: string | undefined) => setValue(v)}
      />
    );
  }
};
