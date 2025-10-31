import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RightPropertiesPanel } from '@/builder/panels/RightPropertiesPanel';
import type { Node as RFNode } from 'reactflow';

type TestNodeData = { template: string; name?: string; config?: Record<string, unknown>; state?: Record<string, unknown> };
function makeNode(template: string, id = 'n1'): RFNode<TestNodeData> {
  return {
    id,
    type: template,
    position: { x: 0, y: 0 },
    data: { template, name: template, config: {}, state: {} },
    dragHandle: '.drag-handle',
    selected: true,
  };
}

const onChange = vi.fn<(id: string, data: Partial<TestNodeData>) => void>();

vi.mock('@/lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({
    templates: [],
    getTemplate: (_name: string) => undefined,
    loading: false,
    ready: true,
    error: null,
  }),
}));

// No capabilities or provisionable mocks; actions render unconditionally and enablement is status-driven

// Avoid requiring QueryClientProvider in this shallow unit test
const statusMock = { provisionStatus: { state: 'not_ready' as const } };
vi.mock('@/lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: statusMock }),
  useNodeAction: () => ({ mutate: (_action: 'provision' | 'deprovision') => {} }),
}));

describe('RightPropertiesPanel placement and enablement', () => {
  beforeEach(() => {
    onChange.mockReset();
  });

  it('renders Actions directly after Runtime Status and before Static Configuration', () => {
    render(<RightPropertiesPanel node={makeNode('t')} onChange={onChange} />);
    const runtimeHeader = screen.getByText('Runtime Status');
    const staticHeader = screen.getByText('Static Configuration');
    const nodeStateHeader = screen.getByText('Node State');

    const actionsHeader = screen.getByText('Actions');
    expect(actionsHeader).toBeInTheDocument();

    // Ensure Actions is not inside Node State
    expect(nodeStateHeader.parentElement?.contains(actionsHeader)).toBe(false);

    // Verify document order: Runtime Status -> Actions -> Static Configuration
    expect(
      (runtimeHeader.compareDocumentPosition(actionsHeader) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true);
    expect(
      (actionsHeader.compareDocumentPosition(staticHeader) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true);
  });

  it('enables Provision on not_ready and disables Deprovision', () => {
    // statusMock starts as not_ready
    render(<RightPropertiesPanel node={makeNode('t')} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Provision' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deprovision' })).toBeDisabled();
  });
});
