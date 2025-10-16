import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReferenceField } from '../referenceField';

describe('ReferenceField', () => {
  it('renders and toggles source', () => {
    const onChange = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ReferenceField formData={{ value: '', source: 'static' }} onChange={onChange} />
      </QueryClientProvider>
    );
    const select = screen.getByLabelText('Reference source');
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'vault' } });
    expect(onChange).toHaveBeenCalled();
  });
});
