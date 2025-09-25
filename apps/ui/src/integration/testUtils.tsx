import React from 'react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesProvider } from '../lib/graph/templates.provider';
import * as socketModule from '../lib/graph/socket';
import type { NodeStatusEvent, TemplateSchema } from '../lib/graph/types';

// Mock socket emitter
export const emitted: Array<NodeStatusEvent> = [];
export function emitNodeStatus(ev: NodeStatusEvent) {
  emitted.push(ev);
  const anySock: any = socketModule.graphSocket as any;
  const set = (anySock.listeners as Map<string, Set<Function>>).get(ev.nodeId);
  if (set) for (const fn of set) fn(ev);
}

export const mockTemplates: TemplateSchema[] = [
  {
    name: 'mock',
    title: 'Mock',
    kind: 'tool',
    sourcePorts: {},
    targetPorts: {},
    capabilities: { pausable: true, staticConfigurable: true, dynamicConfigurable: true },
    staticConfigSchema: { type: 'object', properties: { systemPrompt: { type: 'string', title: 'systemPrompt' } } } as any,
  },
];

// MSW server setup (MSW v2 http handlers)
export const handlers = [
  http.get('/graph/templates', () => HttpResponse.json(mockTemplates)),
  http.get('/graph/nodes/:nodeId/status', ({ params }) => {
    const nodeId = params.nodeId as string;
    return HttpResponse.json({ nodeId, isPaused: false, provisionStatus: { state: 'not_ready' }, dynamicConfigReady: false });
  }),
  http.post('/graph/nodes/:nodeId/actions', () => new HttpResponse(null, { status: 204 })),
  http.get('/graph/nodes/:nodeId/dynamic-config-schema', () =>
    HttpResponse.json({ type: 'object', properties: { toolA: { type: 'boolean', title: 'toolA' }, toolB: { type: 'boolean', title: 'toolB' } } }),
  ),
  http.post('/graph/nodes/:nodeId/config', () => new HttpResponse(null, { status: 204 })),
  http.post('/graph/nodes/:nodeId/dynamic-config', () => new HttpResponse(null, { status: 204 })),
];

export const server = setupServer(...handlers);

export function TestProviders({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      <TemplatesProvider>{children}</TemplatesProvider>
    </QueryClientProvider>
  );
}
