import type { Meta, StoryObj } from '@storybook/react';
import { Table, Thead, Tbody, Tr, Th, Td } from './table';

const meta = { title: 'Components/Table', component: Table } satisfies Meta<typeof Table>;
export default meta;
export type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Table>
      <Thead>
        <Tr>
          <Th>Name</Th>
          <Th>Role</Th>
        </Tr>
      </Thead>
      <Tbody>
        <Tr>
          <Td>Ada Lovelace</Td>
          <Td>Engineer</Td>
        </Tr>
        <Tr>
          <Td>Alan Turing</Td>
          <Td>Scientist</Td>
        </Tr>
      </Tbody>
    </Table>
  )
};

