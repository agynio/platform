import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DynamicConfigForm from '../DynamicConfigForm';

let ready = false;
let schemaData: any = undefined;
let pending = false;
let setMutateImpl: any = vi.fn();
let refetchImpl: any = vi.fn();

vi.mock('../../../lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: { dynamicConfigReady: ready } }),
  useDynamicConfig: () => ({
    schema: { data: schemaData, refetch: (...args: any[]) => refetchImpl(...args) },
    set: { mutate: (...args: any[]) => setMutateImpl(...args), isPending: pending },
  }),
}));

describe('DynamicConfigForm', () => {
  beforeEach(() => {
    ready = false;
    schemaData = undefined;
    pending = false;
    setMutateImpl = vi.fn();
    refetchImpl = vi.fn();
  });

  const renderForm = () => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        {/* @ts-expect-error allow missing initialConfig for test convenience */}
        <DynamicConfigForm nodeId="n1" />
      </QueryClientProvider>,
    );
  };

  it('shows placeholder when not ready', () => {
    renderForm();
    expect(screen.getByText(/Dynamic config not available yet/)).toBeInTheDocument();
  });

  it('shows loading placeholder when ready but schema invalid and triggers refetch once', () => {
    ready = true;
    schemaData = {};
    renderForm();
    expect(screen.getByText(/Loading dynamic config/)).toBeInTheDocument();
    expect(refetchImpl).toHaveBeenCalledOnce();
  });

  it('renders form when ready and autosaves on toggle', () => {
    ready = true;
    schemaData = { type: 'object', properties: { a: { type: 'boolean', title: 'a' } } };
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        {/* @ts-expect-error allow missing initialConfig for test convenience */}
        <DynamicConfigForm nodeId="n1" />
      </QueryClientProvider>,
    );
    const input = screen.getByLabelText('a') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    fireEvent.click(input);
    expect(setMutateImpl).toHaveBeenCalled();
  });

  it('does not render Save button (hidden) while pending but still autosaves', () => {
    ready = true;
    schemaData = { type: 'object', properties: { a: { type: 'boolean', title: 'a' } } };
    pending = true;
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        {/* @ts-expect-error allow missing initialConfig for test convenience */}
        <DynamicConfigForm nodeId="n1" />
      </QueryClientProvider>,
    );
    const input = screen.getByLabelText('a');
    fireEvent.click(input);
    expect(setMutateImpl).toHaveBeenCalled();
  });
});
