/* @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
vi.mock('@/api/modules/graph', () => ({ graph: { getNodeReminders: vi.fn(async () => ({ items: [] })) } }));
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type * as ConfigModule from '@/config';
import { useReminderCount } from '../hooks';
import { createSocketTestServer, type TestSocketServer } from '../../../../__tests__/socketServer.helper';

let socketBaseUrl = 'http://127.0.0.1:0';

vi.mock('@/config', async () => {
  const actual = await vi.importActual<typeof ConfigModule>('@/config');
  return {
    ...actual,
    getSocketBaseUrl: () => socketBaseUrl,
  };
});

let socketServer: TestSocketServer;

describe('useReminderCount', () => {
  beforeAll(async () => {
    socketServer = await createSocketTestServer();
    socketBaseUrl = socketServer.baseUrl;
  });

  afterAll(async () => {
    await socketServer.close();
  });

  it('subscribes to node_reminder_count and updates count', async () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: any) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useReminderCount('n1'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.count).toBe(0);

    await socketServer.waitForRoom('node:n1');

    socketServer.emitReminderCount({
      nodeId: 'n1',
      count: 2,
      updatedAt: new Date().toISOString(),
    });

    await waitFor(() => expect(result.current.data?.count).toBe(2));
  });
});
