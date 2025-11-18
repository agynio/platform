import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http as _http, HttpResponse as _HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as ConfigModule from '@/config';
import { NodeDetailsPanel } from '../../src/components/graph';
import { emitNodeStatus, server, TestProviders, setSocketServer, waitForNodeSubscription } from './testUtils';
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

describe('Integration flows: Node actions, dynamic/static config', () => {
  it('Provision flow with optimistic UI and socket reconcile', async () => {
    render(
      <TestProviders>
        <NodeDetailsPanel nodeId="n1" templateName="mock" />
      </TestProviders>,
    );

    // initial state not_ready
    await waitFor(() => expect(screen.getByText('not_ready')).toBeInTheDocument());

    // click provision -> optimistic provisioning
    fireEvent.click(screen.getByText('Provision'));
    await waitFor(() => expect(screen.getByText('provisioning')).toBeInTheDocument());

    await waitForNodeSubscription('n1');
    // socket emits ready
    emitNodeStatus({ nodeId: 'n1', provisionStatus: { state: 'ready' } });
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());

    // buttons adjust
    expect(screen.getByText('Deprovision')).not.toBeDisabled();
  });

  // Pause/Resume removed; no test for paused reconcile

  // Schema-driven forms removed; covered by custom views tests elsewhere
});
