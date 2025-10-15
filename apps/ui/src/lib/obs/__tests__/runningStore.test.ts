import { describe, it, expect, beforeEach } from 'vitest';
import type { SpanDoc } from '../../obs/api';
import { obsRealtime } from '../../obs/socket';
import { useRunningCount, __resetRunningStoreForTest } from '../../obs/runningStore';
import { renderHook, act } from '@testing-library/react';

// Helper to emit span_upsert using the public test API
function upsert(
  span: Partial<SpanDoc> &
    Pick<
      SpanDoc,
      'traceId' | 'spanId' | 'label' | 'status' | 'startTime' | 'completed' | 'lastUpdate' | 'attributes'
    >,
) {
  const payload: SpanDoc = {
    nodeId: undefined,
    threadId: undefined,
    endTime: undefined,
    events: [],
    idempotencyKeys: [],
    rev: 0,
    createdAt: '',
    updatedAt: '',
    parentSpanId: undefined,
    _id: undefined,
    ...span,
  } as SpanDoc;
  obsRealtime.emitSpanUpsertForTest(payload);
}

describe('runningStore transitions', () => {
  const nodeId = 'n1';
  const now = () => new Date().toISOString();

  beforeEach(() => {
    __resetRunningStoreForTest();
  });

  it('increments on running and decrements on ok', async () => {
    const { result } = renderHook(() => useRunningCount(nodeId, 'agent'));
    expect(result.current).toBe(0);
    act(() => {
      upsert({ traceId: 't', spanId: 's1', label: 'agent', status: 'running', startTime: now(), completed: false, lastUpdate: now(), attributes: { kind: 'agent', nodeId }, nodeId });
    });
    expect(result.current).toBe(1);
    act(() => {
      upsert({ traceId: 't', spanId: 's1', label: 'agent', status: 'ok', startTime: now(), completed: true, lastUpdate: now(), attributes: { kind: 'agent', nodeId }, nodeId });
    });
    expect(result.current).toBe(0);
  });

  it('decrements on error/cancelled', async () => {
    const { result } = renderHook(() => useRunningCount(nodeId, 'tool'));
    expect(result.current).toBe(0);
    act(() => {
      upsert({ traceId: 't2', spanId: 's2', label: 'tool:x', status: 'running', startTime: now(), completed: false, lastUpdate: now(), attributes: { kind: 'tool_call', nodeId, toolNodeId: nodeId }, nodeId });
    });
    expect(result.current).toBe(1);
    act(() => {
      upsert({ traceId: 't2', spanId: 's2', label: 'tool:x', status: 'error', startTime: now(), completed: true, lastUpdate: now(), attributes: { kind: 'tool_call', nodeId, toolNodeId: nodeId }, nodeId });
    });
    expect(result.current).toBe(0);
    act(() => {
      upsert({ traceId: 't3', spanId: 's3', label: 'tool:x', status: 'running', startTime: now(), completed: false, lastUpdate: now(), attributes: { kind: 'tool_call', nodeId, toolNodeId: nodeId }, nodeId });
      upsert({ traceId: 't3', spanId: 's3', label: 'tool:x', status: 'cancelled', startTime: now(), completed: true, lastUpdate: now(), attributes: { kind: 'tool_call', nodeId, toolNodeId: nodeId }, nodeId });
    });
    expect(result.current).toBe(0);
  });

  it('remains accurate after logical eviction (mapping retained)', async () => {
    const { result } = renderHook(() => useRunningCount(nodeId, 'agent'));
    expect(result.current).toBe(0);
    // Simulate many distinct running spans then completion of the first one; count should decrement
    const N = 20;
    act(() => {
      for (let i = 0; i < N; i++) {
        const id = `e${i}`;
        upsert({ traceId: 'te', spanId: id, label: 'agent', status: 'running', startTime: now(), completed: false, lastUpdate: now(), attributes: { kind: 'agent', nodeId }, nodeId });
      }
    });
    expect(result.current).toBe(N);
    act(() => {
      upsert({ traceId: 'te', spanId: 'e0', label: 'agent', status: 'ok', startTime: now(), completed: true, lastUpdate: now(), attributes: { kind: 'agent', nodeId }, nodeId });
    });
    expect(result.current).toBe(N - 1);
  });

  it('tool bucket only counts when nodeId equals Tool id', async () => {
    const { result } = renderHook(() => useRunningCount(nodeId, 'tool'));
    expect(result.current).toBe(0);
    // Missing nodeId on tool_call should not count, even if legacy toolNodeId present
    act(() => {
      upsert({ traceId: 'tf', spanId: 'sf', label: 'tool:legacy', status: 'running', startTime: now(), completed: false, lastUpdate: now(), attributes: { kind: 'tool_call', toolNodeId: nodeId } });
    });
    expect(result.current).toBe(0);
    // Properly attributed with nodeId should count
    act(() => {
      upsert({ traceId: 'tf2', spanId: 'sf2', label: 'tool:new', status: 'running', startTime: now(), completed: false, lastUpdate: now(), attributes: { kind: 'tool_call' }, nodeId });
    });
    expect(result.current).toBe(1);
    act(() => {
      upsert({ traceId: 'tf2', spanId: 'sf2', label: 'tool:new', status: 'ok', startTime: now(), completed: true, lastUpdate: now(), attributes: { kind: 'tool_call' }, nodeId });
    });
    expect(result.current).toBe(0);
  });

  it('does not misclassify agent-kind spans as tool_call', async () => {
    const { result: agentCount } = renderHook(() => useRunningCount(nodeId, 'agent'));
    const { result: toolCount } = renderHook(() => useRunningCount(nodeId, 'tool'));
    expect(agentCount.current).toBe(0);
    expect(toolCount.current).toBe(0);
    act(() => {
      // attrs.kind explicitly agent; label is not a tool
      upsert({ traceId: 'ta', spanId: 'sa', label: 'agent', status: 'running', startTime: now(), completed: false, lastUpdate: now(), attributes: { kind: 'agent', nodeId }, nodeId });
    });
    expect(agentCount.current).toBe(1);
    expect(toolCount.current).toBe(0);
    act(() => {
      upsert({ traceId: 'ta', spanId: 'sa', label: 'agent', status: 'ok', startTime: now(), completed: true, lastUpdate: now(), attributes: { kind: 'agent', nodeId }, nodeId });
    });
    expect(agentCount.current).toBe(0);
    expect(toolCount.current).toBe(0);
  });
});
/* @vitest-environment jsdom */
