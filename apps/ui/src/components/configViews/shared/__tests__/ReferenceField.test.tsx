import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReferenceField from '../ReferenceField';

describe('ReferenceField', () => {
  it('emits normalized shape for string input', () => {
    let last: any = null;
    render(<ReferenceField value="abc" onChange={(v) => (last = v)} />);
    // Change source to vault
    fireEvent.change(screen.getByTestId('ref-source'), { target: { value: 'vault' } });
    fireEvent.change(screen.getByTestId('ref-value'), { target: { value: 'secret/path/key' } });
    expect(last).toEqual({ value: 'secret/path/key', source: 'vault' });
  });

  it('preserves provided object shape', () => {
    let last: any = null;
    render(<ReferenceField value={{ value: 'xoxb-123', source: 'static' }} onChange={(v) => (last = v)} />);
    fireEvent.change(screen.getByTestId('ref-value'), { target: { value: 'xoxb-456' } });
    expect(last).toEqual({ value: 'xoxb-456', source: 'static' });
  });
});
