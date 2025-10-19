import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import McpServerDynamicConfigView from '@/components/configViews/McpServerDynamicConfigView';

vi.mock('@/lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: { dynamicConfigReady: true } }),
  useDynamicConfig: () => ({ schema: { data: { properties: { a: { type: 'boolean' }, b: { type: 'boolean' } } } } }),
}));

describe('McpServerDynamicConfigView', () => {
  it('initializes boolean keys and respects disabled', () => {
    const onChange = vi.fn();
    render(
      <McpServerDynamicConfigView
        nodeId="n1"
        templateName="mcpServer"
        value={{}}
        onChange={onChange}
        readOnly={false}
        disabled={true}
      />,
    );
    expect(screen.getByTestId('mcp-dyn-view')).toBeInTheDocument();
    // Seeds missing boolean keys via initial onChange
    expect(onChange).toHaveBeenCalledWith({ a: false, b: false });
    const checkA = screen.getByLabelText('a') as HTMLInputElement;
    expect(checkA.disabled).toBe(true);
  });

  it('emits onChange when toggled', () => {
    const onChange = vi.fn();
    render(
      <McpServerDynamicConfigView
        nodeId="n1"
        templateName="mcpServer"
        value={{ a: false, b: false }}
        onChange={onChange}
      />,
    );
    const checkA = screen.getByLabelText('a') as HTMLInputElement;
    fireEvent.click(checkA);
    expect(onChange).toHaveBeenCalledWith({ a: true, b: false });
  });

  it('disables inputs when readOnly=true (even if disabled=false)', () => {
    const onChange = vi.fn();
    render(
      <McpServerDynamicConfigView
        nodeId="n1"
        templateName="mcpServer"
        value={{ a: false, b: false }}
        onChange={onChange}
        readOnly={true}
        disabled={false}
      />,
    );
    const checkA = screen.getByLabelText('a') as HTMLInputElement;
    expect(checkA.disabled).toBe(true);
  });
});
