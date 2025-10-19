import React from 'react';
import { setupServer } from 'msw/node';
import { http as _http, HttpResponse as _HttpResponse } from 'msw';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TemplatesProvider } from '../../src/lib/graph/templates.provider';
import * as socketModule from '../../src/lib/graph/socket';
import type { NodeStatusEvent, TemplateSchema } from '../../src/lib/graph/types';
import { TooltipProvider } from '@hautech/ui';

// Mock socket emitter
export const emitted: Array<NodeStatusEvent> = [];
export function emitNodeStatus(ev: NodeStatusEvent) {
  emitted.push(ev);
  const anySock: any = socketModule.graphSocket as any;
  const set = (anySock.listeners as Map<string, Set<(...args: unknown[]) => unknown>>).get(ev.nodeId);
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
  _http.get('/graph/templates', () => _HttpResponse.json(mockTemplates)),
  _http.get('/graph/nodes/:nodeId/status', ({ params }) => {
    const nodeId = params.nodeId as string;
    return _HttpResponse.json({ nodeId, isPaused: false, provisionStatus: { state: 'not_ready' }, dynamicConfigReady: false });
  }),
  _http.post('/graph/nodes/:nodeId/actions', () => new _HttpResponse(null, { status: 204 })),
  _http.get('/graph/nodes/:nodeId/dynamic-config-schema', () =>
    _HttpResponse.json({ type: 'object', properties: { toolA: { type: 'boolean', title: 'toolA' }, toolB: { type: 'boolean', title: 'toolB' } } }),
  ),
  // Full graph endpoints used by setNodeConfig / dynamic set mutation
  _http.get('/api/graph', () =>
    _HttpResponse.json({ name: 'g', version: 1, nodes: [{ id: 'n4', template: 'mock', config: {} }, { id: 'n3', template: 'mock', config: {} }, { id: 'n2', template: 'mock', config: {} }, { id: 'n1', template: 'mock', config: {} }], edges: [] }),
  ),
  _http.post('/api/graph', async ({ request }) => {
    await request.json().catch(() => ({}));
    return _HttpResponse.json({ version: Date.now(), updatedAt: new Date().toISOString() });
  }),
  // Nix proxy handlers used by UI services
  _http.get('/api/nix/packages', ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('query') || '';
    const packages = q && q.length >= 2 ? [{ name: q, description: `${q} package` }] : [];
    return _HttpResponse.json({ packages });
  }),
  _http.get('/api/nix/versions', ({ request }) => {
    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    if (!name) return new _HttpResponse(null, { status: 400 });
    return _HttpResponse.json({ versions: ['1.2.3', '1.0.0'] });
  }),
  _http.get('/api/nix/resolve', ({ request }) => {
    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    const version = url.searchParams.get('version');
    if (!name || !version) return new _HttpResponse(null, { status: 400 });
    return _HttpResponse.json({ name, version, commitHash: 'abcd1234', attributePath: `${name}` });
  }),
];

export const server = setupServer(...handlers);

export function TestProviders({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return (
    <QueryClientProvider client={qc}>
      {/* Match app root providers; ensure tooltip context exists in tests */}
      <TooltipProvider delayDuration={0}>
        <TemplatesProvider>{children}</TemplatesProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
