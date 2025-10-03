import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DynamicConfigForm from '../DynamicConfigForm';

let ready = false;
let schemaData: any = undefined;

vi.mock('../../../lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: { dynamicConfigReady: ready } }),
  useDynamicConfig: () => ({
    schema: { data: schemaData },
  }),
}));

describe('DynamicConfigForm', () => {
  beforeEach(() => {
    ready = false;
    schemaData = undefined;
  });

  const renderForm = (props: any = {}) => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <DynamicConfigForm nodeId="n1" {...props} />
      </QueryClientProvider>,
    );
  };

  it('shows placeholder when not ready', () => {
    renderForm();
    expect(screen.getByText(/Dynamic config not available yet/)).toBeInTheDocument();
  });

  it('renders form when ready and calls onChange to propagate', () => {
    ready = true;
    schemaData = { type: 'object', properties: { a: { type: 'boolean', title: 'a' } } };
    const onChange = vi.fn();
    renderForm({ onConfigChange: onChange });
    const input = screen.getByLabelText('a') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalled();
  });
});
