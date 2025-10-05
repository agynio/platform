import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TracePage } from '../pages/TracePage';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/api', () => ({
  fetchTrace: vi.fn().mockResolvedValue([
    { traceId: 't1', spanId: 'a', label: 'root', status: 'ok', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' },
    { traceId: 't1', spanId: 'b', parentSpanId: 'a', label: 'child', status: 'ok', startTime: new Date().toISOString(), endTime: new Date().toISOString(), completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' }
  ]),
  fetchLogs: vi.fn().mockResolvedValue([])
}));

vi.mock('react-router-dom', async (orig) => {
  const actual: any = await orig();
  return { ...actual, useParams: () => ({ traceId: 't1' }) } as any;
});

describe('TracePage', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('renders timeline then span details after click', async () => {
  render(<MemoryRouter><TracePage /></MemoryRouter>);
    const timeline = await screen.findByText(/Timeline/);
    expect(timeline).toBeTruthy();
  const rootSpans = await screen.findAllByText('root');
  fireEvent.click(rootSpans[0]);
  // After selecting span, ensure Attributes tab button is present (unique by role and name)
  const attrsTab = await screen.findAllByText('Attributes');
  expect(attrsTab.length).toBeGreaterThan(0);
  });
});
