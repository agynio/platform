import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StaticConfigForm from '../StaticConfigForm';

let withSchema = true;
let useRefToken = false;
vi.mock('../../../lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({
    getTemplate: (name: string) => ({
      name,
      title: name,
      kind: 'tool',
      sourcePorts: {},
      targetPorts: {},
      capabilities: { staticConfigurable: withSchema },
      staticConfigSchema: withSchema
        ? useRefToken
          ? {
              type: 'object',
              properties: { token: { $ref: '#/$defs/TokenRef' } },
              $defs: { TokenRef: { type: 'object', 'ui:field': 'ReferenceField' } },
            }
          : { type: 'object', properties: { systemPrompt: { type: 'string', title: 'systemPrompt' } } }
        : undefined,
    }),
  }),
}));

describe('StaticConfigForm', () => {
  beforeEach(() => {
    withSchema = true;
    useRefToken = false;
  });

  const renderForm = (props: any = {}) => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <StaticConfigForm templateName="tmpl" initialConfig={{ systemPrompt: 'hi' }} {...props} />
      </QueryClientProvider>,
    );
  };

  it('renders input and calls onChange to propagate value', () => {
    const onChange = vi.fn();
    renderForm({ onConfigChange: onChange });
    const input = screen.getByLabelText('systemPrompt');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalled();
    const arg = (onChange as any).mock.calls[0][0];
    expect(arg.systemPrompt).toBe('hello');
  });

  it('shows no form if schema absent', () => {
    withSchema = false;
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <StaticConfigForm templateName="tmpl" />
      </QueryClientProvider>,
    );
    expect(screen.getByText(/No static config available/)).toBeInTheDocument();
  });

  it('renders ReferenceField for token via $ref ui:field', () => {
    useRefToken = true;
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <StaticConfigForm templateName="githubCloneRepoTool" />
      </QueryClientProvider>,
    );
    // ReferenceField renders a select with aria-label
    expect(screen.getByLabelText('Reference source')).toBeInTheDocument();
  });
});
