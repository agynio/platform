import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
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
    name: 'worker-service',
    title: 'Worker Service',
    kind: 'service',
    sourcePorts: ['dispatch'],
    targetPorts: ['ingest'],
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

function renderWithGraphProviders(children: React.ReactNode) {
  render(
    <TestProviders>
      <TemplatesProvider>
        <MemoryRouter>{children}</MemoryRouter>
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

  it('renders agent rows and filters by search text', async () => {
    primeGraphHandlers();

    const user = userEvent.setup();

    renderWithGraphProviders(<AgentsListPage />);

    await screen.findByText('Core Agent');
    expect(screen.queryByText('Webhook Trigger')).not.toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Search agents');
    await user.type(searchInput, 'trigger');

    await waitFor(() => expect(screen.getByText('No agents match “trigger”.')).toBeInTheDocument());

    await user.clear(searchInput);
    await waitFor(() => expect(screen.getByText('Core Agent')).toBeVisible());
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

    renderWithGraphProviders(<AgentsListPage />);

    await screen.findByText('Core Agent');
    await user.click(screen.getByRole('button', { name: /new agent/i }));

    const templateSelect = screen.getByRole('combobox', { name: /template/i });
    await user.selectOptions(templateSelect, 'support-agent');

    const titleInput = await screen.findByLabelText('Title');
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

    renderWithGraphProviders(<AgentsListPage />);

    await screen.findByText('Core Agent');
    await user.click(screen.getAllByRole('button', { name: /edit/i })[0]);

    const titleInput = await screen.findByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Updated');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(notifications.error).toHaveBeenCalled());
    const alert = await screen.findByText('Graph updated elsewhere');
    expect(alert).toBeVisible();

    const refreshButton = await screen.findByRole('button', { name: /refresh graph/i, hidden: true });
    await user.click(refreshButton);
    await waitFor(() => expect(screen.queryByText('Graph updated elsewhere')).not.toBeInTheDocument());
  });

  it('requires selecting a template before enabling create actions', async () => {
    primeGraphHandlers();

    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithGraphProviders(<AgentsListPage />);

    await screen.findByText('Core Agent');
    await user.click(screen.getByRole('button', { name: /new agent/i }));

    const createButton = screen.getByRole('button', { name: /create/i });
    expect(createButton).toBeDisabled();

    const templateSelect = screen.getByRole('combobox', { name: /template/i });
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
});
