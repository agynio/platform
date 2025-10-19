import { SpanDoc } from '../types';

export function buildTree(spans: SpanDoc[]): SpanNode[] {
  const byId: Record<string, SpanNode> = {};
  spans.forEach(s => { byId[s.spanId] = { span: s, children: [] }; });
  const roots: SpanNode[] = [];
  spans.forEach(s => {
    if (s.parentSpanId && byId[s.parentSpanId]) {
      byId[s.parentSpanId].children.push(byId[s.spanId]);
    } else if (!s.parentSpanId) {
      roots.push(byId[s.spanId]);
    }
  });
  return roots;
}

export interface SpanNode { span: SpanDoc; children: SpanNode[]; }
