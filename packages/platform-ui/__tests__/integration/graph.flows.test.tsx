import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http as _http, HttpResponse as _HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NodeDetailsPanel } from '../../src/components/graph';
import { disposeGraphSocket, emitNodeStatus, server, startSocketTestServer, stopSocketTestServer, TestProviders } from './testUtils';

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

    // socket emits ready
    emitNodeStatus({ nodeId: 'n1', provisionStatus: { state: 'ready' } });
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());

    // buttons adjust
    expect(screen.getByText('Deprovision')).not.toBeDisabled();
  });

  // Pause/Resume removed; no test for paused reconcile

  // Schema-driven forms removed; covered by custom views tests elsewhere
});
vi.setConfig({ testTimeout: 30000 });
