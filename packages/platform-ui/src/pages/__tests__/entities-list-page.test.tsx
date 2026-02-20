import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import type { ProvisionState } from '@/api/types/graph';
import { TemplatesProvider } from '@/lib/graph/templates.provider';

const pointerProto = Element.prototype as typeof Element.prototype & {
  hasPointerCapture?: (pointerId: number) => boolean;
  setPointerCapture?: (pointerId: number) => void;
  releasePointerCapture?: (pointerId: number) => void;
  scrollIntoView?: (opts?: ScrollIntoViewOptions | boolean) => void;
};

if (!pointerProto.hasPointerCapture) {
  pointerProto.hasPointerCapture = () => false;
}
if (!pointerProto.setPointerCapture) {
  pointerProto.setPointerCapture = () => {};
}
if (!pointerProto.releasePointerCapture) {
  pointerProto.releasePointerCapture = () => {};
}
if (!pointerProto.scrollIntoView) {
  pointerProto.scrollIntoView = () => {};
}
import { AgentsListPage } from '../AgentsListPage';
import { TriggersListPage } from '../TriggersListPage';
import { ToolsListPage } from '../ToolsListPage';
import { WorkspacesListPage } from '../WorkspacesListPage';
import { MemoryEntitiesListPage } from '../MemoryEntitiesListPage';
import { McpServersListPage } from '../McpServersListPage';
import { EntityUpsertPage } from '../entities/EntityUpsertPage';
import { EXCLUDED_WORKSPACE_TEMPLATES, INCLUDED_MEMORY_WORKSPACE_TEMPLATES } from '@/features/entities/api/graphEntities';

const notifications = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/notify', () => ({
  notifySuccess: (...args: unknown[]) => notifications.success(...args),
  notifyError: (...args: unknown[]) => notifications.error(...args),
}));

const templateSet = [
  {
    name: 'support-agent',
    title: 'Support Agent',
    kind: 'agent',
    sourcePorts: ['output'],
    targetPorts: ['input'],
  },
  {
    name: 'http-trigger',
    title: 'HTTP Trigger',
    kind: 'trigger',
    sourcePorts: ['output'],
    targetPorts: [],
  },
  {
    name: 'slack-tool',
    title: 'Slack Tool',
    kind: 'tool',
    sourcePorts: ['send'],
    targetPorts: ['receive'],
  },
  {
    name: 'filesystem-mcp',
    title: 'Filesystem MCP',
    kind: 'mcp',
    sourcePorts: ['out'],
    targetPorts: ['in'],
  },
  {
    name: 'worker-service',
    title: 'Worker Service',
    kind: 'service',
    sourcePorts: ['dispatch'],
    targetPorts: ['ingest'],
  },
  {
    name: 'memory',
    title: 'Memory Workspace',
    kind: 'service',
    sourcePorts: [],
    targetPorts: [],
  },
  {
    name: 'memoryConnector',
    title: 'Memory Connector',
    kind: 'service',
    sourcePorts: [],
    targetPorts: [],
  },
];

const baseGraph = {
  name: 'main',
  version: 2,
  updatedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  nodes: [
    { id: 'trigger-1', template: 'http-trigger', config: { title: 'Webhook Trigger' } },
    { id: 'agent-1', template: 'support-agent', config: { title: 'Core Agent', description: 'Primary responder' } },
    { id: 'tool-1', template: 'slack-tool', config: { title: 'Slack Tool' } },
    { id: 'workspace-1', template: 'worker-service', config: { title: 'Worker Pool' } },
  ],
  edges: [
    { id: 'edge-1', source: 'trigger-1', sourceHandle: 'output', target: 'agent-1', targetHandle: 'input' },
  ],
};

function primeGraphHandlers(graphOverride = baseGraph) {
  const payload = JSON.parse(JSON.stringify(graphOverride));
  server.use(
    http.get(abs('/api/graph'), () => HttpResponse.json(payload)),
    http.get(abs('/api/graph/templates'), () => HttpResponse.json(templateSet)),
  );
}

type MockProvisionStatus = { state: ProvisionState; details?: unknown };

function mockNodeStatuses(statuses: Record<string, MockProvisionStatus>) {
  server.use(
    http.get(abs('/api/graph/nodes/:nodeId/status'), ({ params }) => {
      const nodeId = params.nodeId as string;
      const payload = statuses[nodeId] ?? { state: 'not_ready' as ProvisionState };
      return HttpResponse.json({ nodeId, isPaused: false, provisionStatus: payload });
    }),
  );
}

function renderWithGraphProviders(children: React.ReactNode) {
  render(
    <TestProviders>
      <TemplatesProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </TemplatesProvider>
    </TestProviders>,
  );
}

function renderWithEntityRoutes(initialEntries: string[], routes: React.ReactNode) {
  render(
    <TestProviders>
      <TemplatesProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>{routes}</Routes>
        </MemoryRouter>
      </TemplatesProvider>
    </TestProviders>,
  );
}

describe('Entity list pages', () => {
  beforeAll(() => server.listen());
  afterAll(() => server.close());
  afterEach(() => {
    server.resetHandlers();
    notifications.success.mockReset();
    notifications.error.mockReset();
  });

  it('renders agent rows without mixing entity kinds', async () => {
    primeGraphHandlers();

    renderWithGraphProviders(<AgentsListPage />);

    const titleElement = await screen.findByText('Core Agent', { selector: '[data-testid="entity-title"]' });
    const titleCell = titleElement.closest('td');
    expect(titleCell).not.toBeNull();
    expect(within(titleCell as HTMLTableCellElement).queryByText('Primary responder')).not.toBeInTheDocument();

    const row = titleElement.closest('tr');
    expect(row).not.toBeNull();
    const templateLabel = within(row as HTMLTableRowElement).getByTestId('entity-template');
    expect(templateLabel).toHaveTextContent('Support Agent');

    expect(screen.queryByText('Webhook Trigger')).not.toBeInTheDocument();
  });

  it('renders only workspaces on the workspaces page without memory controls', async () => {
    primeGraphHandlers();

    renderWithGraphProviders(<WorkspacesListPage />);

    await screen.findByText('Worker Pool');
    expect(screen.queryByText('Core Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Webhook Trigger')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open memory manager/i })).not.toBeInTheDocument();
  });

  it('excludes memory workspace templates from the workspaces list', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [
        { id: 'workspace-1', template: 'worker-service', config: { title: 'Worker Pool' } },
        { id: 'workspace-2', template: 'memory', config: { title: 'Memory Root' } },
        { id: 'workspace-3', template: 'memoryConnector', config: { title: 'Memory Connector' } },
      ],
    };
    primeGraphHandlers(graphOverride);

    renderWithGraphProviders(<WorkspacesListPage />);

    await screen.findByText('Worker Pool');
    expect(screen.queryByText('Memory Root')).not.toBeInTheDocument();
    expect(screen.queryByText('Memory Connector')).not.toBeInTheDocument();
  });

  it('excludes memory workspace templates from the workspace create page', async () => {
    primeGraphHandlers();

    renderWithEntityRoutes(
      ['/workspaces/new'],
      <Route
        path="/workspaces/new"
        element={(
          <EntityUpsertPage
            kind="workspace"
            mode="create"
            listPath="/workspaces"
            templateExcludeNames={EXCLUDED_WORKSPACE_TEMPLATES}
          />
        )}
      />,
    );

    const templateSelect = await screen.findByRole('combobox', { name: /template/i });
    await within(templateSelect).findByRole('option', { name: 'Worker Service' });
    expect(within(templateSelect).queryByRole('option', { name: 'Memory Workspace' })).not.toBeInTheDocument();
    expect(within(templateSelect).queryByRole('option', { name: 'Memory Connector' })).not.toBeInTheDocument();
  });

  it('keeps MCP servers separate from tools, including template picker', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [
        { id: 'tool-1', template: 'slack-tool', config: { title: 'Slack Tool' } },
        { id: 'mcp-1', template: 'filesystem-mcp', config: { title: 'Filesystem MCP' } },
      ],
      edges: [],
    };
    primeGraphHandlers(graphOverride);

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithEntityRoutes(
      ['/tools'],
      <>
        <Route path="/tools" element={<ToolsListPage />} />
        <Route path="/tools/new" element={<EntityUpsertPage kind="tool" mode="create" listPath="/tools" />} />
      </>,
    );

    await screen.findByText('Slack Tool', { selector: '[data-testid="entity-title"]' });
    expect(screen.queryByText('Filesystem MCP', { selector: '[data-testid="entity-title"]' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /new tool/i }));

    const templateSelect = await screen.findByRole('combobox', { name: /template/i });
    expect(within(templateSelect).getByRole('option', { name: 'Slack Tool' })).toBeInTheDocument();
    expect(within(templateSelect).queryByRole('option', { name: 'Filesystem MCP' })).not.toBeInTheDocument();
  });

  it('renders only memory entities on the memory page', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [
        { id: 'memory-1', template: 'memory', config: { title: 'Memory Root' } },
        { id: 'workspace-1', template: 'worker-service', config: { title: 'Worker Pool' } },
      ],
      edges: [],
    };
    primeGraphHandlers(graphOverride);

    renderWithGraphProviders(<MemoryEntitiesListPage />);

    await screen.findByText('Memory Root');
    expect(screen.queryByText('Worker Pool')).not.toBeInTheDocument();
    expect(screen.queryByText('Core Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Webhook Trigger')).not.toBeInTheDocument();
  });

  it('displays provision statuses (ready/provisioning/error) with inline error details', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [
        { id: 'agent-ready', template: 'support-agent', config: { title: 'Ready Agent' } },
        { id: 'agent-provisioning', template: 'support-agent', config: { title: 'Provisioning Agent' } },
        { id: 'agent-error', template: 'support-agent', config: { title: 'Broken Agent' } },
      ],
      edges: [],
    };
    primeGraphHandlers(graphOverride);
    mockNodeStatuses({
      'agent-ready': { state: 'ready' },
      'agent-provisioning': { state: 'provisioning' },
      'agent-error': { state: 'error', details: { message: 'boom' } },
    });

    renderWithGraphProviders(<AgentsListPage />);

    const readyCell = await screen.findByText('Ready Agent', { selector: '[data-testid="entity-title"]' });
    const readyRow = readyCell.closest('tr');
    expect(readyRow).not.toBeNull();
    expect(within(readyRow as HTMLTableRowElement).getByTestId('entity-status-cell')).toHaveTextContent('ready');

    const provisioningCell = await screen.findByText('Provisioning Agent', { selector: '[data-testid="entity-title"]' });
    const provisioningRow = provisioningCell.closest('tr');
    expect(provisioningRow).not.toBeNull();
    expect(within(provisioningRow as HTMLTableRowElement).getByTestId('entity-status-cell')).toHaveTextContent('provisioning');

    const errorCell = await screen.findByText('Broken Agent', { selector: '[data-testid="entity-title"]' });
    const errorRow = errorCell.closest('tr');
    expect(errorRow).not.toBeNull();
    expect(within(errorRow as HTMLTableRowElement).getByTestId('entity-status-cell')).toHaveTextContent('error');
    expect(within(errorRow as HTMLTableRowElement).getByTestId('entity-status-error')).toHaveTextContent('{"message":"boom"}');
  });

  it('limits the memory create page to memory templates only', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [{ id: 'memory-1', template: 'memory', config: { title: 'Memory Root' } }],
      edges: [],
    };
    primeGraphHandlers(graphOverride);

    renderWithEntityRoutes(
      ['/memory/new'],
      <Route
        path="/memory/new"
        element={(
          <EntityUpsertPage
            kind="workspace"
            mode="create"
            listPath="/memory"
            templateIncludeNames={INCLUDED_MEMORY_WORKSPACE_TEMPLATES}
          />
        )}
      />,
    );

    const templateSelect = await screen.findByRole('combobox', { name: /template/i });
    await within(templateSelect).findByRole('option', { name: 'Memory Workspace' });
    expect(within(templateSelect).getByRole('option', { name: 'Memory Connector' })).toBeInTheDocument();
    expect(within(templateSelect).queryByRole('option', { name: 'Worker Service' })).not.toBeInTheDocument();
  });

  it('renders only MCP servers on the MCP page and limits templates accordingly', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [
        { id: 'mcp-1', template: 'filesystem-mcp', config: { title: 'Filesystem MCP' } },
        { id: 'tool-1', template: 'slack-tool', config: { title: 'Slack Tool' } },
      ],
      edges: [],
    };
    primeGraphHandlers(graphOverride);

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithEntityRoutes(
      ['/mcp'],
      <>
        <Route path="/mcp" element={<McpServersListPage />} />
        <Route path="/mcp/new" element={<EntityUpsertPage kind="mcp" mode="create" listPath="/mcp" />} />
      </>,
    );

    await screen.findByText('Filesystem MCP', { selector: '[data-testid="entity-title"]' });
    expect(screen.queryByText('Slack Tool', { selector: '[data-testid="entity-title"]' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /new mcp server/i }));

    const templateSelect = await screen.findByRole('combobox', { name: /template/i });
    await within(templateSelect).findByRole('option', { name: 'Filesystem MCP' });
    expect(within(templateSelect).queryByRole('option', { name: 'Slack Tool' })).not.toBeInTheDocument();
  });

  it('renders the MCP config view in the edit dialog', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [{ id: 'mcp-1', template: 'filesystem-mcp', config: { title: 'Filesystem MCP' } }],
      edges: [],
    };
    primeGraphHandlers(graphOverride);

    server.use(
      http.get(abs('/api/graph/nodes/mcp-1/state'), () =>
        HttpResponse.json({ state: { mcp: { tools: [{ name: 'search', title: 'Search' }], enabledTools: ['search'] } } }),
      ),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithEntityRoutes(
      ['/mcp'],
      <>
        <Route path="/mcp" element={<McpServersListPage />} />
        <Route path="/mcp/:entityId/edit" element={<EntityUpsertPage kind="mcp" mode="edit" listPath="/mcp" />} />
      </>,
    );

    const titleCell = await screen.findByText('Filesystem MCP', { selector: '[data-testid="entity-title"]' });
    const row = titleCell.closest('tr');
    expect(row).not.toBeNull();
    await user.click(within(row as HTMLTableRowElement).getByRole('button', { name: /edit/i }));

    await screen.findByText('Namespace');
    expect(screen.getByPlaceholderText('npx -y @modelcontextprotocol/server-everything')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('saves memory entity edits when no edges are present', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [
        { id: 'memory-1', template: 'memory', config: { title: 'Memory Root' } },
        { id: 'memory-2', template: 'memoryConnector', config: { title: 'Memory Connector' } },
      ],
      edges: [],
    };
    primeGraphHandlers(graphOverride);

    const savedPayload: { body?: any } = {};
    server.use(
      http.post(abs('/api/graph'), async ({ request }) => {
        savedPayload.body = await request.json();
        return HttpResponse.json({
          ...graphOverride,
          version: graphOverride.version + 1,
          nodes: graphOverride.nodes.map((node) =>
            node.id === 'memory-1' ? { ...node, config: { ...node.config, title: 'Memory Updated' } } : node,
          ),
        });
      }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithEntityRoutes(
      ['/memory'],
      <>
        <Route path="/memory" element={<MemoryEntitiesListPage />} />
        <Route
          path="/memory/:entityId/edit"
          element={(
            <EntityUpsertPage
              kind="workspace"
              mode="edit"
              listPath="/memory"
              templateIncludeNames={INCLUDED_MEMORY_WORKSPACE_TEMPLATES}
            />
          )}
        />
      </>,
    );

    await screen.findByText('Memory Root');
    await user.click(screen.getAllByRole('button', { name: /edit/i })[0]);

    const titleInput = await screen.findByLabelText('Entity title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Memory Updated');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(notifications.success).toHaveBeenCalledWith('Entity updated'));
    expect(savedPayload.body?.edges).toEqual([]);
  });

  it('shows trigger entities in the triggers list', async () => {
    primeGraphHandlers();

    renderWithGraphProviders(<TriggersListPage />);

    await screen.findByText('Webhook Trigger');
    expect(screen.queryByText('Core Agent')).not.toBeInTheDocument();
  });

  it('creates a new agent and persists the graph', async () => {
    primeGraphHandlers();

    const savedPayload: { body?: any } = {};
    server.use(
      http.post(abs('/api/graph'), async ({ request }) => {
        savedPayload.body = await request.json();
        return HttpResponse.json({
          ...baseGraph,
          version: baseGraph.version + 1,
          nodes: [
            ...baseGraph.nodes,
            { id: 'agent-new', template: 'support-agent', config: { title: 'Responder' } },
          ],
        });
      }),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithEntityRoutes(
      ['/agents'],
      <>
        <Route path="/agents" element={<AgentsListPage />} />
        <Route path="/agents/new" element={<EntityUpsertPage kind="agent" mode="create" listPath="/agents" />} />
      </>,
    );

    await screen.findByText('Core Agent');
    await user.click(screen.getByRole('button', { name: /new agent/i }));

    const templateSelect = screen.getByRole('combobox', { name: /template/i });
    await within(templateSelect).findByRole('option', { name: 'Support Agent' });
    await user.selectOptions(templateSelect, 'support-agent');

    const titleInput = await screen.findByLabelText('Entity title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Responder');

    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(notifications.success).toHaveBeenCalledWith('Entity created'));
    expect(savedPayload.body).toBeDefined();
    expect(savedPayload.body.nodes.some((node: any) => node.template === 'support-agent' && node.config?.title === 'Responder')).toBe(true);
    expect(savedPayload.body.edges).toEqual(baseGraph.edges);
  });

  it('shows conflict banner when graph version is stale and refreshes on demand', async () => {
    primeGraphHandlers();

    server.use(
      http.post(abs('/api/graph'), async () =>
        new HttpResponse(
          JSON.stringify({ error: 'VERSION_CONFLICT', current: { ...baseGraph, version: baseGraph.version + 1 } }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithEntityRoutes(
      ['/agents'],
      <>
        <Route path="/agents" element={<AgentsListPage />} />
        <Route path="/agents/:entityId/edit" element={<EntityUpsertPage kind="agent" mode="edit" listPath="/agents" />} />
      </>,
    );

    await screen.findByText('Core Agent');
    await user.click(screen.getAllByRole('button', { name: /edit/i })[0]);

    const titleInput = await screen.findByLabelText('Entity title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(notifications.error).toHaveBeenCalled());
    await screen.findByText('Unable to save entity. Please try again.');

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    const alert = await screen.findByText('Graph updated elsewhere');
    expect(alert).toBeVisible();

    const refreshButton = await screen.findByRole('button', { name: /refresh graph/i, hidden: true });
    await user.click(refreshButton);
    await waitFor(() => expect(screen.queryByText('Graph updated elsewhere')).not.toBeInTheDocument());
  });

  it('requires selecting a template before enabling create actions', async () => {
    primeGraphHandlers();

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithEntityRoutes(
      ['/agents/new'],
      <Route path="/agents/new" element={<EntityUpsertPage kind="agent" mode="create" listPath="/agents" />} />,
    );

    const createButton = screen.getByRole('button', { name: /create/i });
    expect(createButton).toBeDisabled();

    const templateSelect = await screen.findByRole('combobox', { name: /template/i });
    await within(templateSelect).findByRole('option', { name: 'Support Agent' });
    await waitFor(() => expect(templateSelect).not.toBeDisabled());
    await user.selectOptions(templateSelect, 'support-agent');

    await waitFor(() => expect(createButton).not.toBeDisabled());
  });

  it('sorts entity rows by title and template columns', async () => {
    const alphaAgentTemplate = {
      name: 'alpha-agent',
      title: 'Atlas Agent',
      kind: 'agent',
      sourcePorts: ['output'],
      targetPorts: ['input'],
    };
    const sortGraph = {
      ...baseGraph,
      nodes: [
        { id: 'agent-zulu', template: 'support-agent', config: { title: 'Zulu Agent' } },
        { id: 'agent-alpha', template: 'alpha-agent', config: { title: 'Alpha Agent' } },
      ],
      edges: [],
    };
    primeGraphHandlers(sortGraph);
    server.use(http.get(abs('/api/graph/templates'), () => HttpResponse.json([...templateSet, alphaAgentTemplate])));

    const user = userEvent.setup();

    renderWithGraphProviders(<AgentsListPage />);

    await screen.findByText('Zulu Agent');
    await screen.findByText('Alpha Agent');

    const readTitles = () => screen.getAllByTestId('entity-title').map((node) => node.textContent ?? '');

    expect(readTitles()).toEqual(['Alpha Agent', 'Zulu Agent']);

    await user.click(screen.getByRole('button', { name: /sort by title/i }));
    expect(readTitles()).toEqual(['Zulu Agent', 'Alpha Agent']);

    await user.click(screen.getByRole('button', { name: /sort by template/i }));
    expect(readTitles()).toEqual(['Alpha Agent', 'Zulu Agent']);
  });

  it('sends provision/deprovision requests with correct payloads and disables both controls while pending', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [
        { id: 'agent-error', template: 'support-agent', config: { title: 'Broken Agent' } },
        { id: 'agent-ready', template: 'support-agent', config: { title: 'Ready Agent' } },
      ],
      edges: [],
    };
    primeGraphHandlers(graphOverride);
    mockNodeStatuses({
      'agent-error': { state: 'error' },
      'agent-ready': { state: 'ready' },
    });

    const requests: Array<{ nodeId: string; action?: string }> = [];
    server.use(
      http.post(abs('/api/graph/nodes/:nodeId/actions'), async ({ request, params }) => {
        const body = (await request.json()) as { action?: string };
        requests.push({ nodeId: params.nodeId as string, action: body?.action });
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();

    renderWithGraphProviders(<AgentsListPage />);

    const brokenAgentCell = await screen.findByText('Broken Agent', { selector: '[data-testid="entity-title"]' });
    const brokenRow = brokenAgentCell.closest('tr') as HTMLTableRowElement;
    const brokenStatusCell = within(brokenRow).getByTestId('entity-status-cell');
    const provisionButton = within(brokenStatusCell).getByRole('button', { name: /^Provision$/i });
    expect(provisionButton).not.toBeDisabled();
    expect(within(brokenStatusCell).queryByRole('button', { name: /^Deprovision$/i })).toBeNull();

    await user.click(provisionButton);
    expect(provisionButton).toBeDisabled();
    await waitFor(() => expect(brokenStatusCell).toHaveTextContent('provisioning'));
    await waitFor(() => expect(provisionButton).not.toBeDisabled());
    await waitFor(() => expect(brokenStatusCell).toHaveTextContent('error'));

    const readyAgentCell = await screen.findByText('Ready Agent', { selector: '[data-testid="entity-title"]' });
    const readyRow = readyAgentCell.closest('tr') as HTMLTableRowElement;
    const readyStatusCell = within(readyRow).getByTestId('entity-status-cell');
    const readyDeprovisionButton = within(readyStatusCell).getByRole('button', { name: /^Deprovision$/i });
    expect(readyDeprovisionButton).not.toBeDisabled();
    expect(within(readyStatusCell).queryByRole('button', { name: /^Provision$/i })).toBeNull();

    await user.click(readyDeprovisionButton);
    expect(readyDeprovisionButton).toBeDisabled();
    const reenabledDeprovisionButton = await within(readyStatusCell).findByRole('button', { name: /^Deprovision$/i });
    expect(reenabledDeprovisionButton).not.toBeDisabled();

    expect(requests).toEqual([
      { nodeId: 'agent-error', action: 'provision' },
      { nodeId: 'agent-ready', action: 'deprovision' },
    ]);
  });

  it('shows the stop icon while provisioning and sends a deprovision request', async () => {
    const graphOverride = {
      ...baseGraph,
      nodes: [{ id: 'agent-provisioning', template: 'support-agent', config: { title: 'Provisioning Agent' } }],
      edges: [],
    };
    primeGraphHandlers(graphOverride);
    mockNodeStatuses({
      'agent-provisioning': { state: 'provisioning' },
    });

    const requests: Array<{ nodeId: string; action?: string }> = [];
    server.use(
      http.post(abs('/api/graph/nodes/:nodeId/actions'), async ({ request, params }) => {
        const body = (await request.json()) as { action?: string };
        requests.push({ nodeId: params.nodeId as string, action: body?.action });
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();

    renderWithGraphProviders(<AgentsListPage />);

    const provisioningAgentCell = await screen.findByText('Provisioning Agent', { selector: '[data-testid="entity-title"]' });
    const provisioningRow = provisioningAgentCell.closest('tr') as HTMLTableRowElement;
    const provisioningStatusCell = within(provisioningRow).getByTestId('entity-status-cell');
    await waitFor(() => expect(provisioningStatusCell).toHaveTextContent(/\bprovisioning\b/));
    const stopButton = await within(provisioningStatusCell).findByRole('button', { name: /^Deprovision$/i });

    expect(stopButton).not.toBeDisabled();
    expect(provisioningStatusCell.querySelector('svg.lucide-square')).not.toBeNull();

    await user.click(stopButton);
    expect(stopButton).toBeDisabled();

    await waitFor(() => expect(requests).toEqual([{ nodeId: 'agent-provisioning', action: 'deprovision' }]));
  });
});
