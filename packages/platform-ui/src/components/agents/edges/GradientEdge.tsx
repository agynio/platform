import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';

import type { NodeKind } from '@/components/Node';

const nodeKindToColor: Record<NodeKind, string> = {
  Trigger: 'var(--agyn-yellow)',
  Agent: 'var(--agyn-blue)',
  Tool: 'var(--agyn-cyan)',
  MCP: 'var(--agyn-cyan)',
  Workspace: 'var(--agyn-purple)',
};

const defaultSourceColor = 'var(--agyn-blue)';
const defaultTargetColor = 'var(--agyn-purple)';

type GradientEdgeData = {
  sourceColor?: string;
  targetColor?: string;
  sourceKind?: NodeKind;
  targetKind?: NodeKind;
};

function resolveColor(explicit: string | undefined, kind: NodeKind | undefined, fallback: string): string {
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  if (kind) {
    return nodeKindToColor[kind] ?? fallback;
  }
  return fallback;
}

export function GradientEdge(props: EdgeProps<Edge<GradientEdgeData>>) {
  const [edgePath] = getBezierPath(props);
  const { source, target, sourceX, sourceY, targetX, targetY, data } = props;
  const edgeData = data ?? {};
  const sourceColor = resolveColor(edgeData.sourceColor, edgeData.sourceKind, defaultSourceColor);
  const targetColor = resolveColor(edgeData.targetColor, edgeData.targetKind, defaultTargetColor);
  const gradientId = `graph-gradient-edge-${source}-${target}`;

  return (
    <>
      <svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={sourceX}
            y1={sourceY}
            x2={targetX}
            y2={targetY}
          >
            <stop offset="0%" stopColor={sourceColor} />
            <stop offset="100%" stopColor={targetColor} />
          </linearGradient>
        </defs>
      </svg>
      <BaseEdge path={edgePath} style={{ stroke: `url(#${gradientId})`, strokeWidth: 2 }} />
    </>
  );
}
