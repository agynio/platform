import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StaticConfigForm from '../StaticConfigForm';

let withSchema = true;
vi.mock('../../../lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({
    getTemplate: (name: string) => ({
      name,
      title: name,
      kind: 'tool',
      sourcePorts: {},
      targetPorts: {},
      capabilities: { staticConfigurable: withSchema },
      staticConfigSchema: withSchema ? { type: 'object', properties: { systemPrompt: { type: 'string', title: 'systemPrompt' } } } : undefined,
    }),
  }),
}));

let mutateImpl: any = vi.fn();
vi.mock('../../../lib/graph/hooks', () => ({
  useSetNodeConfig: () => ({ mutate: (...args: any[]) => mutateImpl(...args), isPending: false }),
}));

describe('StaticConfigForm', () => {
  beforeEach(() => {
    withSchema = true;
    mutateImpl = vi.fn();
  });

  const renderForm = (props: any = {}) => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <StaticConfigForm nodeId="n1" templateName="tmpl" initialConfig={{ systemPrompt: 'hi' }} {...props} />
      </QueryClientProvider>,
    );
  };

  it('renders input and autosaves value on change', () => {
    renderForm();
    const input = screen.getByLabelText('systemPrompt');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(mutateImpl).toHaveBeenCalled();
    const arg = (mutateImpl as any).mock.calls[0][0];
    expect(arg.systemPrompt).toBe('hello');
  });

  it('shows no form if schema absent', () => {
    withSchema = false;
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <StaticConfigForm nodeId="n1" templateName="tmpl" />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/No static config available/)).toBeInTheDocument();
  });

  it('still triggers mutate (error path) on change without Save button', () => {
    mutateImpl = vi.fn((_data: any, opts?: any) => opts?.onError?.(new Error('x')));
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <StaticConfigForm nodeId="n1" templateName="tmpl" initialConfig={{}} />
      </QueryClientProvider>,
    );
    const input = screen.getByLabelText('systemPrompt');
    fireEvent.change(input, { target: { value: 'new' } });
    expect(mutateImpl).toHaveBeenCalled();
  });
});
