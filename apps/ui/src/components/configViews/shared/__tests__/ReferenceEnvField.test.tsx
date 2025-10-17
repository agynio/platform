import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReferenceEnvField from '../ReferenceEnvField';

describe('ReferenceEnvField', () => {
  it('adds rows and emits array', () => {
    let last: any = null;
    render(<ReferenceEnvField value={{ FOO: '1' }} onChange={(v) => (last = v)} />);
    fireEvent.click(screen.getByTestId('env-add'));
    fireEvent.change(screen.getByTestId('env-key-1'), { target: { value: 'BAR' } });
    fireEvent.change(screen.getByTestId('env-value-1'), { target: { value: '2' } });
    expect(Array.isArray(last)).toBe(true);
    expect(last[1]).toEqual({ key: 'BAR', value: '2', source: 'static' });
  });
});
