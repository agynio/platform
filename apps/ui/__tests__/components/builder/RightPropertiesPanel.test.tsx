import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RightPropertiesPanel } from '@/builder/panels/RightPropertiesPanel';
import { registerConfigView, clearRegistry } from '@/components/configViews/registry';

function makeNode(template: string, id = 'n1') {
  return {
    id,
    type: template,
    position: { x: 0, y: 0 },
    data: { template, name: template, config: {}, dynamicConfig: {} },
    dragHandle: '.drag-handle',
    selected: true,
  } as any;
}

const onChange = vi.fn();

vi.mock('@/lib/graph/templates.provider', () => ({
  useTemplatesCache: () => ({
    templates: [],
    getTemplate: () => undefined,
    loading: false,
    ready: true,
    error: null,
  }),
}));

vi.mock('@/lib/graph/capabilities', async () => {
  const actual = await vi.importActual<any>('@/lib/graph/capabilities');
  return {
    ...actual,
    hasStaticConfigByName: () => true,
    hasDynamicConfigByName: () => true,
    canPause: () => false,
    canProvision: () => false,
  };
});

// Avoid requiring QueryClientProvider in this shallow unit test
vi.mock('@/lib/graph/hooks', () => ({
  useNodeStatus: () => ({ data: undefined }),
  useNodeAction: () => ({ mutate: () => {} }),
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
    const Static: React.FC<any> = () => <div>StaticView</div>;
    const Dynamic: React.FC<any> = () => <div>DynamicView</div>;
    registerConfigView({ template: 't', mode: 'static', component: Static as any });
    registerConfigView({ template: 't', mode: 'dynamic', component: Dynamic as any });
    render(<RightPropertiesPanel node={makeNode('t')} onChange={onChange} />);
    expect(screen.getByText('StaticView')).toBeInTheDocument();
    expect(screen.getByText('DynamicView')).toBeInTheDocument();
  });

  it('renders fallback placeholders when view missing', () => {
    render(<RightPropertiesPanel node={makeNode('missing')} onChange={onChange} />);
    expect(screen.getByText(/No custom view registered for missing \(static\)/)).toBeInTheDocument();
    expect(screen.getByText(/No custom view registered for missing \(dynamic\)/)).toBeInTheDocument();
  });
});
