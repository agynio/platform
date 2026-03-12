import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';

import { server, TestProviders, abs } from '../../../__tests__/integration/testUtils';
import { TemplatesProvider } from '@/lib/graph/templates.provider';
import { AgentsListPage } from '../AgentsListPage';
import { ToolsListPage } from '../ToolsListPage';
import { WorkspacesListPage } from '../WorkspacesListPage';
import { MemoryEntitiesListPage } from '../MemoryEntitiesListPage';

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
    name: 'agent',
    title: 'Agent Template',
    kind: 'agent',
    sourcePorts: ['output'],
    targetPorts: ['input'],
  },
  {
    name: 'manageTool',
    title: 'Manage Tool',
    kind: 'tool',
    sourcePorts: ['tools'],
    targetPorts: [],
  },
  {
    name: 'mcpServer',
    title: 'MCP Server',
    kind: 'mcp',
    sourcePorts: ['out'],
    targetPorts: ['in'],
  },
  {
    name: 'workspace',
    title: 'Workspace',
    kind: 'service',
    sourcePorts: ['dispatch'],
    targetPorts: ['ingest'],
  },
  {
    name: 'memory',
    title: 'Memory Bucket',
    kind: 'service',
    sourcePorts: [],
    targetPorts: [],
  },
];

function primeTeamHandlers() {
  server.use(
    http.get(abs('/api/graph/templates'), () => HttpResponse.json(templateSet)),
    http.get(abs('/api/graph/nodes/:nodeId/status'), ({ params }) =>
      HttpResponse.json({ nodeId: params.nodeId, isPaused: false, provisionStatus: { state: 'not_ready' } }),
    ),
    http.get(abs('/apiv2/team/v1/agents'), () =>
      HttpResponse.json({
        items: [
          {
            id: 'agent-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            title: 'Core Agent',
            description: 'Primary responder',
            config: { model: 'gpt-4' },
          },
        ],
        page: 1,
        perPage: 50,
        total: 1,
      }),
    ),
    http.get(abs('/apiv2/team/v1/tools'), () =>
      HttpResponse.json({
        items: [
          {
            id: 'tool-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            type: 'manage',
            name: 'manage_team',
            description: 'Manage tool',
            config: { name: 'manage_team' },
          },
        ],
        page: 1,
        perPage: 50,
        total: 1,
      }),
    ),
    http.get(abs('/apiv2/team/v1/mcp-servers'), () =>
      HttpResponse.json({
        items: [
          {
            id: 'mcp-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            title: 'Filesystem MCP',
            description: 'Local MCP',
            config: { namespace: 'fs', command: 'fs' },
          },
        ],
        page: 1,
        perPage: 50,
        total: 1,
      }),
    ),
    http.get(abs('/apiv2/team/v1/workspace-configurations'), () =>
      HttpResponse.json({
        items: [
          {
            id: 'workspace-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            title: 'Worker Pool',
            description: 'Default workspace',
            config: { image: 'docker.io/library/node:18' },
          },
        ],
        page: 1,
        perPage: 50,
        total: 1,
      }),
    ),
    http.get(abs('/apiv2/team/v1/memory-buckets'), () =>
      HttpResponse.json({
        items: [
          {
            id: 'memory-1',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            title: 'Global Memory',
            description: 'Shared',
            config: { scope: 'global' },
          },
        ],
        page: 1,
        perPage: 50,
        total: 1,
      }),
    ),
    http.get(abs('/apiv2/team/v1/attachments'), () =>
      HttpResponse.json({
        items: [],
        page: 1,
        perPage: 50,
        total: 0,
      }),
    ),
  );
}

function renderWithProviders(children: React.ReactNode) {
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

  it('renders agent rows without mixing entity kinds', async () => {
    primeTeamHandlers();

    renderWithProviders(<AgentsListPage />);

    const titleElement = await screen.findByText('Core Agent', { selector: '[data-testid="entity-title"]' });
    const row = titleElement.closest('tr');
    expect(row).not.toBeNull();
    const templateLabel = within(row as HTMLTableRowElement).getByTestId('entity-template');
    expect(templateLabel).toHaveTextContent('Agent Template');
    expect(screen.queryByText('Worker Pool')).not.toBeInTheDocument();
  });

  it('renders tools and templates for tool entries', async () => {
    primeTeamHandlers();

    renderWithProviders(<ToolsListPage />);

    const titleElement = await screen.findByText('Manage tool', { selector: '[data-testid="entity-title"]' });
    const row = titleElement.closest('tr');
    expect(row).not.toBeNull();
    const templateLabel = within(row as HTMLTableRowElement).getByTestId('entity-template');
    expect(templateLabel).toHaveTextContent('Manage Tool');
  });

  it('renders only workspaces on the workspaces page', async () => {
    primeTeamHandlers();

    renderWithProviders(<WorkspacesListPage />);

    await screen.findByText('Worker Pool');
    expect(screen.queryByText('Global Memory')).not.toBeInTheDocument();
  });

  it('renders memory buckets on the memory page', async () => {
    primeTeamHandlers();

    renderWithProviders(<MemoryEntitiesListPage />);

    const titleElement = await screen.findByText('Global Memory', { selector: '[data-testid="entity-title"]' });
    const row = titleElement.closest('tr');
    expect(row).not.toBeNull();
    const templateLabel = within(row as HTMLTableRowElement).getByTestId('entity-template');
    expect(templateLabel).toHaveTextContent('Memory Bucket');
  });
});
