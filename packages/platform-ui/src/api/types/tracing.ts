export type SpanDoc = {
  traceId: string;
  spanId: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  attributes?: Record<string, unknown>;
};

export type SpanExtras = {
  status?: string;
  lastUpdate?: string;
  nodeId?: string;
  endedAt?: string;
};

