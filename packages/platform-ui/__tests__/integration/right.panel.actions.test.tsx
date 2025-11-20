import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { disposeGraphSocket, emitNodeStatus, server, startSocketTestServer, stopSocketTestServer, TestProviders } from './testUtils';
import { http as _http, HttpResponse as _HttpResponse } from 'msw';
import { RightPropertiesPanel } from '../../src/builder/panels/RightPropertiesPanel';
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

describe('Right panel actions: Provision/Deprovision optimistic and reconcile', () => {
  beforeAll(async () => {
    await startSocketTestServer();
    server.listen();
  });
  afterEach(() => {
    server.resetHandlers();
    disposeGraphSocket();
  });
  afterAll(async () => {
    server.close();
    await stopSocketTestServer();
  });

  it('clicking Provision moves status to provisioning then ready; Deprovision moves to deprovisioning then not_ready', async () => {
    render(
      <TestProviders>
        <RightPropertiesPanel node={makeNode('mock')} onChange={() => {}} />
      </TestProviders>,
    );

    // initial state not_ready from server
    await waitFor(() => expect(screen.getByText('not_ready')).toBeInTheDocument());

    // click start -> optimistic provisioning
    fireEvent.click(screen.getByText('Provision'));
    await waitFor(() => expect(screen.getByText('provisioning')).toBeInTheDocument());

    // socket emits ready
    emitNodeStatus({ nodeId: 'n1', provisionStatus: { state: 'ready' } });
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
    expect(screen.getByText('Deprovision')).not.toBeDisabled();

    // click stop -> optimistic deprovisioning
    fireEvent.click(screen.getByText('Deprovision'));
    await waitFor(() => expect(screen.getByText('deprovisioning')).toBeInTheDocument());

    // socket emits not_ready
    emitNodeStatus({ nodeId: 'n1', provisionStatus: { state: 'not_ready' } });
    await waitFor(() => expect(screen.getByText('not_ready')).toBeInTheDocument());
    expect(screen.getByText('Provision')).not.toBeDisabled();
  });
});
vi.setConfig({ testTimeout: 30000 });
