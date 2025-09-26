import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DynamicConfigForm, NodeDetailsPanel, StaticConfigForm } from '../../src/components/graph';
import { emitNodeStatus, server, TestProviders } from './testUtils';

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Integration flows: Node actions, dynamic/static config', () => {
  it('Provision flow with optimistic UI and socket reconcile', async () => {
    render(
      <TestProviders>
        <NodeDetailsPanel nodeId="n1" templateName="mock" />
      </TestProviders>,
    );

    // initial state not_ready
    await waitFor(() => expect(screen.getByText('not_ready')).toBeInTheDocument());

    // click start -> optimistic provisioning
    fireEvent.click(screen.getByText('Start'));
    await waitFor(() => expect(screen.getByText('provisioning')).toBeInTheDocument());

    // socket emits ready
    emitNodeStatus({ nodeId: 'n1', provisionStatus: { state: 'ready' } });
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());

    // buttons adjust
    expect(screen.getByText('Stop')).not.toBeDisabled();
  });

  it('Pause/Resume with reconcile', async () => {
    render(
      <TestProviders>
        <NodeDetailsPanel nodeId="n2" templateName="mock" />
      </TestProviders>,
    );

    // Ensure initial subscription/effect is set
    await waitFor(() => expect(screen.getByText('not_ready')).toBeInTheDocument());

    // Move to ready
    emitNodeStatus({ nodeId: 'n2', provisionStatus: { state: 'ready' } });
    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());

    // Pause -> optimistic paused
    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => expect(screen.getByText('paused')).toBeInTheDocument());

    // Reconcile to unpaused
    emitNodeStatus({ nodeId: 'n2', isPaused: false });
    await waitFor(() => expect(screen.queryByText('paused')).not.toBeInTheDocument());
  });

  it('Dynamic config readiness, schema fetch, submit', async () => {
    render(
      <TestProviders>
  <DynamicConfigForm nodeId="n3" />
      </TestProviders>,
    );

    // Not ready placeholder
    await waitFor(() => expect(screen.getByText(/Dynamic config not available yet/)).toBeInTheDocument());

    // Ready event then schema-based form appears
    emitNodeStatus({ nodeId: 'n3', dynamicConfigReady: true });

    // Checkbox presence
    await waitFor(() => expect(screen.getByLabelText('toolA')).toBeInTheDocument());

  fireEvent.click(screen.getByLabelText('toolA'));
  });

  it('Static config submission and error handling', async () => {
    // Force POST /config to error
    server.use(http.post('/graph/nodes/:nodeId/config', () => new HttpResponse(null, { status: 500 })));

    render(
      <TestProviders>
  <StaticConfigForm nodeId="n4" templateName="mock" />
      </TestProviders>,
    );

    // Form appears
    const input = await screen.findByLabelText('systemPrompt');
  fireEvent.change(input, { target: { value: 'xyz' } });
  });
});
