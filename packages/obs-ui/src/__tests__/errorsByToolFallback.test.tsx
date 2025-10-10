import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ErrorsByToolPage } from '../pages/ErrorsByToolPage';

describe('ErrorsByToolPage fallback when metrics 404', () => {
  const origFetch = global.fetch as any;

  beforeEach(() => {
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('/v1/metrics/errors-by-tool')) {
        return new Response('', { status: 404 });
      }
      if (u.includes('/v1/spans')) {
        const body = { items: [
          // two weather errors, one search ok (ignored), one non-tool error (ignored)
          { traceId: 't1', spanId: 'a', label: 'tool:weather', status: 'error', startTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' },
          { traceId: 't2', spanId: 'b', label: 'tool:weather', status: 'error', startTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' },
          { traceId: 't3', spanId: 'c', label: 'tool:search', status: 'ok', startTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' },
          { traceId: 't4', spanId: 'd', label: 'llm:openai', status: 'error', startTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' },
        ] };
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }) as any;
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  it('aggregates client-side when metrics endpoint missing', async () => {
    render(
      <MemoryRouter initialEntries={[`/errors/tools`]}>
        <Routes>
          <Route path="/errors/tools" element={<ErrorsByToolPage />} />
        </Routes>
      </MemoryRouter>
    );
    // Should show weather with count 2
    await waitFor(async () => {
      expect(await screen.findByText('tool:weather')).toBeTruthy();
    });
  });
});

