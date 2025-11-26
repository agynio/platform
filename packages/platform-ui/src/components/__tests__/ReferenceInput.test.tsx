import React, { useState } from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { ReferenceInput } from '../ReferenceInput';

describe('ReferenceInput', () => {
  it('keeps the suggestion dropdown closed until user interaction when openOnFocus is false', async () => {
    function Wrapper() {
      const [value, setValue] = useState('');
      return (
        <ReferenceInput
          value={value}
          onChange={(event) => setValue(event.target.value)}
          sourceType="secret"
          secretProvider={async () => ['alpha-secret']}
          providerDebounceMs={0}
          placeholder="Secret value"
        />
      );
    }

    render(<Wrapper />);

    const input = screen.getByPlaceholderText('Secret value');
    expect(screen.queryByText('alpha-secret')).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.queryByText('alpha-secret')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'alpha' } });

    await waitFor(() => expect(screen.getByText('alpha-secret')).toBeInTheDocument());
  });

  it('allows opting into focus-triggered suggestions when openOnFocus is true', async () => {
    function Wrapper() {
      const [value, setValue] = useState('');
      return (
        <ReferenceInput
          value={value}
          onChange={(event) => setValue(event.target.value)}
          sourceType="secret"
          secretProvider={async () => ['beta-secret']}
          providerDebounceMs={0}
          placeholder="Secret value"
          openOnFocus
        />
      );
    }

    render(<Wrapper />);

    const input = screen.getByPlaceholderText('Secret value');
    fireEvent.focus(input);

    await waitFor(() => expect(screen.getByText('beta-secret')).toBeInTheDocument());
  });
});
