import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferenceField } from '../referenceField';

describe('ReferenceField', () => {
  it('renders and toggles source', () => {
    const onChange = vi.fn();
    render(<ReferenceField formData={{ value: '', source: 'static' }} onChange={onChange} />);
    const select = screen.getByLabelText('Reference source');
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'vault' } });
    expect(onChange).toHaveBeenCalled();
  });
});
