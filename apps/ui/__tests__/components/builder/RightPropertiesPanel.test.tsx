import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('renders Tools section for mcpServer using node.data.state.mcp.tools and toggles dynamicConfig', () => {
    const node = makeNode('mcpServer');
    node.data.state = { mcp: { tools: [{ name: 't1', description: 'Tool 1' }, { name: 't2', title: 'Tool Two' }] } };
    node.data.dynamicConfig = { t1: true };
    render(<RightPropertiesPanel node={node} onChange={onChange} />);
    expect(screen.getByTestId('mcp-tools-section')).toBeInTheDocument();
    // There should be labels/toggles for tools
    expect(screen.getByText('t1')).toBeInTheDocument();
    // title preferred over name when present
    expect(screen.getByText('Tool Two')).toBeInTheDocument();
    // Toggle t2 on
    const toggle = screen.getByLabelText('t2');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalled();
    const args = onChange.mock.calls.pop();
    expect(args[0]).toBe(node.id);
    expect(args[1].dynamicConfig).toBeDefined();
    expect(args[1].dynamicConfig.t2).toBe(true);
  });

  it('hides Dynamic Configuration for mcpServer; shows for non-mcp template', () => {
    // mcpServer should hide Dynamic Configuration label
    const mcp = makeNode('mcpServer');
    mcp.data.state = { mcp: { tools: [{ name: 'x' }] } };
    render(<RightPropertiesPanel node={mcp} onChange={onChange} />);
    expect(screen.queryByText('Dynamic Configuration')).not.toBeInTheDocument();

    // Non-MCP template shows Dynamic Configuration
    const t = makeNode('custom');
    render(<RightPropertiesPanel node={t} onChange={onChange} />);
    expect(screen.getByText('Dynamic Configuration')).toBeInTheDocument();
  });
});
