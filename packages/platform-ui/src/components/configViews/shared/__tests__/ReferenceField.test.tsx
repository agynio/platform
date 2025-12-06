import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReferenceField from '../ReferenceField';

const pointerProto = Element.prototype as unknown as {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
};

if (!pointerProto.hasPointerCapture) {
  pointerProto.hasPointerCapture = () => false;
}
if (!pointerProto.setPointerCapture) {
  pointerProto.setPointerCapture = () => {};
}
if (!pointerProto.releasePointerCapture) {
  pointerProto.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('ReferenceField', () => {
  it('emits canonical vault structure when switching source', async () => {
    const user = userEvent.setup();
    let last: unknown = null;
    render(<ReferenceField value="abc" onChange={(v) => (last = v)} />);

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    const secretOption = within(listbox).getByRole('option', { name: /secret/i });
    await user.click(secretOption);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    fireEvent.change(input, { target: { value: 'secret/data/api' } });
    expect(last).toMatchObject({ kind: 'vault', mount: 'secret', path: 'data', key: 'api' });
  });

  it('preserves string output for static references', async () => {
    const user = userEvent.setup();
    let last: unknown = null;
    render(<ReferenceField value={{ value: 'xoxb-123', source: 'static' }} onChange={(v) => (last = v)} />);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'xoxb-456');

    expect(last).toBe('xoxb-456');
  });
});
