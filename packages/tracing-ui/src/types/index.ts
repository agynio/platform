// Re-declare SpanDoc shape for UI (could alternatively import via shared pkg later)
export interface SpanDoc {
  _id?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  label: string;
  status: 'running' | 'ok' | 'error' | 'cancelled';
  startTime: string;
  endTime?: string;
  completed: boolean;
  lastUpdate: string;
  attributes: Record<string, unknown>;
  events: Array<{ ts: string; name: string; attrs?: Record<string, unknown> }>;
  rev: number;
  idempotencyKeys: string[];
  createdAt: string;
  updatedAt: string;
  nodeId?: string;
  threadId?: string;
}

export interface LogDoc {
  _id?: string;
  traceId?: string;
  spanId?: string;
  level: 'debug' | 'info' | 'error';
  message: string;
  ts: string;
  attributes?: Record<string, unknown>;
  createdAt: string;
}
