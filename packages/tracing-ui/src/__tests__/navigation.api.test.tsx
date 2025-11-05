import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TracingTracesView } from '../../src/views/TracingTracesView';
import { TracingProvider } from '../../src/context/TracingProvider';

vi.mock('../../src/services/api', () => ({
  fetchTraces: async () => ([{ traceId: 't1', root: { traceId: 't1', spanId: 's1', label: 'root', status: 'ok', startTime: new Date().toISOString(), lastUpdate: new Date().toISOString(), attributes: {} }, spanCount: 1, failedCount: 0, lastUpdate: new Date().toISOString() }])
}));
vi.mock('../../src/services/socket', () => ({ spanRealtime: { onSpanUpsert: () => () => {}, onConnectionState: (cb: any) => { cb({ connected: false, lastPongTs: null }); return () => {}; } } }));

describe('navigation API', () => {
  it('calls onNavigate for trace link', async () => {
    const onNavigate = vi.fn();
    render(
      <TracingProvider serverUrl="http://localhost:4319">
        <TracingTracesView basePaths={{ trace: '/x/trace', thread: '/x/thread' }} onNavigate={onNavigate} />
      </TracingProvider>
    );
    const row = await screen.findByTestId('obsui-traces-row');
    const a = row.querySelector('a')!;
    fireEvent.click(a);
    expect(onNavigate).toHaveBeenCalledWith({ type: 'trace', id: 't1' });
  });
});
