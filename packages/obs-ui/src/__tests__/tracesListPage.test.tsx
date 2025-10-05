import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TracesListPage } from '../pages/TracesListPage';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../services/api', () => ({
  fetchTraces: vi.fn().mockResolvedValue([
    { traceId: 't1', root: { traceId: 't1', spanId: 'a', label: 'root', status: 'ok', startTime: '', completed: true, lastUpdate: new Date().toISOString(), attributes: {}, events: [], rev: 0, idempotencyKeys: [], createdAt: '', updatedAt: '' }, spanCount: 2, lastUpdate: new Date().toISOString() }
  ])
}));

describe('TracesListPage', () => {
  it('renders traces table', async () => {
  render(<MemoryRouter><TracesListPage /></MemoryRouter>);
    const heading = await screen.findByText('Traces');
    expect(heading).toBeTruthy();
    const t1 = await screen.findByText('t1');
    expect(t1).toBeTruthy();
  });
});
