import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { Node } from 'reactflow';
import { RightPropertiesPanel, BuilderPanelNodeData } from '@/builder/panels/RightPropertiesPanel';
import { registerConfigView, clearRegistry } from '@/components/configViews/registry';
import type { StaticConfigViewComponent, DynamicConfigViewComponent } from '@/components/configViews/types';

function makeNode(template: string, id = 'n1'): Node<BuilderPanelNodeData> {
  return {
    id,
    type: template,
    position: { x: 0, y: 0 },
    data: { template, name: template, config: {}, state: {} },
    dragHandle: '.drag-handle',
    selected: true,
  };
}

const onChange = vi.fn<(id: string, data: Partial<BuilderPanelNodeData>) => void>();

vi.mock('@/lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({
    templates: [],
    getTemplate: () => undefined,
    loading: false,
    ready: true,
    error: null,
  }),
}));

// No capabilities mock needed for these tests

// Avoid requiring QueryClientProvider in this shallow unit test
vi.mock('@/lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: undefined }),
  useNodeAction: () => ({ mutate: (_action: 'provision' | 'deprovision') => {} }),
}));

describe('RightPropertiesPanel', () => {
  beforeEach(() => {
    clearRegistry();
    onChange.mockReset();
  });

  it('renders placeholder when no node selected', () => {
    render(<RightPropertiesPanel node={null} onChange={onChange} />);
    expect(screen.getByText(/Select a node/)).toBeInTheDocument();
  });

  it('uses custom views when registered', () => {
    const Static: StaticConfigViewComponent = () => <div>StaticView</div>;
    const Dynamic: DynamicConfigViewComponent = () => <div>DynamicView</div>;
    registerConfigView({ template: 't', mode: 'static', component: Static });
    registerConfigView({ template: 't', mode: 'dynamic', component: Dynamic });
    render(<RightPropertiesPanel node={makeNode('t')} onChange={onChange} />);
    expect(screen.getByText('StaticView')).toBeInTheDocument();
    expect(screen.getByText('DynamicView')).toBeInTheDocument();
  });

  it('renders fallback placeholders when view missing', () => {
    render(<RightPropertiesPanel node={makeNode('missing')} onChange={onChange} />);
    expect(screen.getByText(/No custom view registered for missing \(static\)/)).toBeInTheDocument();
    expect(screen.getByText(/No custom view registered for missing \(state\)/)).toBeInTheDocument();
  });
});
