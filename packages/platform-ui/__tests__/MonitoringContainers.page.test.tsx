import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestProviders } from './integration/testUtils';
import { MonitoringContainers } from '../src/pages/MonitoringContainers';

describe('MonitoringContainers page', () => {
  const httpJsonMock = vi.hoisted(() => vi.fn());
  vi.mock('@/api/client', () => ({ httpJson: httpJsonMock }));
  beforeEach(() => {
    vi.clearAllMocks();
    httpJsonMock.mockReset();
  });

  it('renders truncated containerId with tooltip and copy', async () => {
    const items = [{
      containerId: '1234567890abcdef',
      threadId: null,
      role: 'workspace',
      image: 'node:20',
      status: 'running' as const,
      startedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      lastUsedAt: new Date('2024-01-01T01:00:00Z').toISOString(),
      killAfterAt: null,
    }];
    httpJsonMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/containers?')) return { items } as any;
      if (url.includes('/sidecars')) return { items: [] } as any;
      if (url === '/api/graph/templates') return [] as any;
      return { items: [] } as any;
    });
    // Clipboard stub
    const writeText = vi.fn();
    (globalThis as any).navigator = { clipboard: { writeText } };
    render(<MemoryRouter initialEntries={[{ pathname: '/monitoring/containers' }]}><TestProviders><MonitoringContainers /></TestProviders></MemoryRouter>);
    // truncated id should be visible
    expect(await screen.findByText('12345678')).toBeTruthy();
    // open tooltip by hovering
    const short = screen.getByText('12345678');
    await userEvent.hover(short);
    const fullIds = await screen.findAllByText('1234567890abcdef');
    expect(fullIds.length).toBeGreaterThan(0);
    // click copy button (first match)
    const copyBtns = await screen.findAllByLabelText('Copy containerId');
    fireEvent.click(copyBtns[0]);
    expect(writeText).toHaveBeenCalledWith('1234567890abcdef');
  });

  it('applies threadId filter only when valid UUID', async () => {
    const items = [] as any[];
    httpJsonMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/containers?')) return { items } as any;
      if (url === '/api/graph/templates') return [] as any;
      return { items: [] } as any;
    });
    render(<MemoryRouter initialEntries={[{ pathname: '/monitoring/containers' }]}><TestProviders><MonitoringContainers /></TestProviders></MemoryRouter>);
    const input = screen.getByLabelText('Filter by threadId');
    fireEvent.change(input, { target: { value: 'not-a-uuid' } });
    await waitFor(() => expect(httpJsonMock).toHaveBeenCalled());
    // Should not include threadId param when invalid
    const listCalls1 = httpJsonMock.mock.calls.filter((c) => typeof c?.[0] === 'string' && (c?.[0] as string).startsWith('/api/containers?'));
    expect(listCalls1[0]?.[0] as string).not.toMatch(/threadId=/);
    // Now provide a valid UUID
    const uuid = '11111111-1111-1111-1111-111111111111';
    fireEvent.change(input, { target: { value: uuid } });
    await waitFor(() => {
      const calls = httpJsonMock.mock.calls.filter((c) => typeof c?.[0] === 'string' && (c?.[0] as string).startsWith('/api/containers?'));
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
    const listCalls2 = httpJsonMock.mock.calls.filter((c) => typeof c?.[0] === 'string' && (c?.[0] as string).startsWith('/api/containers?'));
    const url = listCalls2[1]?.[0] as string;
    expect(url).toMatch(/threadId=11111111-1111-1111-1111-111111111111/);
    // Clear/reset
    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);
    await waitFor(() => {
      const calls = httpJsonMock.mock.calls.filter((c) => typeof c?.[0] === 'string' && (c?.[0] as string).startsWith('/api/containers?'));
      expect(calls.length).toBeGreaterThanOrEqual(3);
    });
    const listCalls3 = httpJsonMock.mock.calls.filter((c) => typeof c?.[0] === 'string' && (c?.[0] as string).startsWith('/api/containers?'));
    const url3 = listCalls3[2]?.[0] as string;
    expect(url3).not.toMatch(/threadId=/);
  });

  it('expands row to fetch and render sidecars', async () => {
    const parentId = 'abc123456789';
    const items = [{
      containerId: parentId,
      threadId: '11111111-1111-1111-1111-111111111111',
      role: 'workspace',
      image: 'node:20',
      status: 'running' as const,
      startedAt: new Date('2024-01-01T00:00:00Z').toISOString(),
      lastUsedAt: new Date('2024-01-01T01:00:00Z').toISOString(),
      killAfterAt: null,
    }];
    const sidecars = [{
      containerId: 'sc-999988887777',
      parentContainerId: parentId,
      role: 'dind' as const,
      image: 'docker:27-dind',
      status: 'running' as const,
      startedAt: new Date('2024-01-01T00:10:00Z').toISOString(),
    }];
    httpJsonMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/containers?')) return { items } as any;
      if (url.endsWith(`/api/containers/${encodeURIComponent(parentId)}/sidecars`)) return { items: sidecars } as any;
      if (url === '/api/graph/templates') return [] as any;
      return { items: [] } as any;
    });
    render(<MemoryRouter initialEntries={[{ pathname: '/monitoring/containers' }]}><TestProviders><MonitoringContainers /></TestProviders></MemoryRouter>);
    // Expand the row
    const expandBtn = await screen.findByLabelText('Expand');
    fireEvent.click(expandBtn);
    // Sidecar truncated id should render under parent row
    await waitFor(() => expect(screen.getByText('sc-99998')).toBeTruthy());
    // Role column should show dind for sidecar
    expect(screen.getByText('dind')).toBeTruthy();
  });
});
