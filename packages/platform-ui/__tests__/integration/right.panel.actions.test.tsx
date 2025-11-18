import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from '@/config';
import { emitNodeStatus, server, TestProviders, setSocketServer, waitForNodeSubscription } from './testUtils';
import { RightPropertiesPanel } from '../../src/builder/panels/RightPropertiesPanel';
import type { Node as RFNode } from 'reactflow';
import { createSocketTestServer, type TestSocketServer } from '../socketServer.helper';

let socketBaseUrl = 'http://127.0.0.1:0';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return {
    ...actual,
    getSocketBaseUrl: () => socketBaseUrl,
  };
});

let socketServer: TestSocketServer;

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

describe('Right panel actions: Provision/Deprovision optimistic and reconcile', () => {
  beforeAll(async () => {
    socketServer = await createSocketTestServer();
    socketBaseUrl = socketServer.baseUrl;
    setSocketServer(socketServer);
    server.listen();
  });

  afterEach(() => server.resetHandlers());

  afterAll(async () => {
    server.close();
    setSocketServer(null);
    await socketServer.close();
  });

  it('clicking Provision moves status to provisioning then ready; Deprovision moves to deprovisioning then not_ready', async () => {
    render(
      <TestProviders>
        <RightPropertiesPanel node={makeNode('mock')} onChange={() => {}} />
      </TestProviders>,
    );

    await waitFor(() => expect(screen.getByText('not_ready')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Provision'));
    await waitFor(() => expect(screen.getByText('provisioning')).toBeInTheDocument());

    await waitForNodeSubscription('n1');
    emitNodeStatus({ nodeId: 'n1', provisionStatus: { state: 'ready' } });
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
    expect(screen.getByText('Deprovision')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Deprovision'));
    await waitFor(() => expect(screen.getByText('deprovisioning')).toBeInTheDocument());

    emitNodeStatus({ nodeId: 'n1', provisionStatus: { state: 'not_ready' } });
    await waitFor(() => expect(screen.getByText('not_ready')).toBeInTheDocument());
    expect(screen.getByText('Provision')).not.toBeDisabled();
  });
});
