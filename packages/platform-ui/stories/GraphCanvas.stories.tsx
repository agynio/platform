import React, { useCallback, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { Edge, Node } from '@xyflow/react';
import { BaseEdge, getBezierPath } from '@xyflow/react';
import { addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';

import { GraphCanvas, type GraphNodeData } from '../src/components/GraphCanvas';

const gradientEdgeId = 'graph-gradient-edge';

const nodeKindToColor: Record<GraphNodeData['kind'], string> = {
	Trigger: 'var(--agyn-yellow)',
	Agent: 'var(--agyn-blue)',
	Tool: 'var(--agyn-cyan)',
	MCP: 'var(--agyn-cyan)',
	Workspace: 'var(--agyn-purple)',
};

function GradientEdge(props: any) {
	const [edgePath] = getBezierPath(props);
	const { source, target, data } = props;

	// Fallback colors in case mapping data is missing
	const sourceColor = data?.sourceColor ?? 'var(--agyn-blue)';
	const targetColor = data?.targetColor ?? 'var(--agyn-purple)';

	return (
		<>
			<svg style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none' }}>
				<defs>
					<linearGradient
						id={`${gradientEdgeId}-${source}-${target}`}
						gradientUnits="userSpaceOnUse"
						x1={props.sourceX}
						y1={props.sourceY}
						x2={props.targetX}
						y2={props.targetY}
					>
						<stop offset="0%" stopColor={sourceColor} />
						<stop offset="100%" stopColor={targetColor} />
					</linearGradient>
				</defs>
			</svg>
			<BaseEdge
					path={edgePath}
					style={{ stroke: `url(#${gradientEdgeId}-${source}-${target})`, strokeWidth: 3 }}
			/>
		</>
	);
}

const meta: Meta<typeof GraphCanvas> = {
	title: 'Screens/Graph/GraphCanvas',
	component: GraphCanvas,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['!autodocs'],
};

export default meta;

type Story = StoryObj<typeof GraphCanvas>;

export const Default: Story = {
	render: () => {
		const initialNodes: Node<GraphNodeData>[] = [
			// Top row (more spaced horizontally)
			{
				id: '1',
				type: 'graphNode',
				position: { x: 0, y: 0 },
				data: {
					kind: 'Trigger',
					title: 'HTTP Webhook',
					inputs: [],
					outputs: [{ id: 'out-1', title: 'OUT' }],
				},
			},
			{
				id: '2',
				type: 'graphNode',
				position: { x: 320, y: 0 },
				data: {
					kind: 'Agent',
					title: 'Reasoning Agent',
					inputs: [{ id: 'in-2', title: 'IN' }],
					outputs: [
						{ id: 'out-2a', title: 'TOOLS' },
						{ id: 'out-2b', title: 'RESULT' },
					],
				},
			},
			{
				id: '3',
				type: 'graphNode',
				position: { x: 640, y: 0 },
				data: {
					kind: 'Tool',
					title: 'Search Tool',
					inputs: [{ id: 'in-3', title: 'QUERY' }],
					outputs: [{ id: 'out-3', title: 'RESULTS' }],
				},
			},
			// Bottom row (same spacing, lower)
			{
				id: '4',
				type: 'graphNode',
				position: { x: 0, y: 220 },
				data: {
					kind: 'Trigger',
					title: 'Cron Schedule',
					inputs: [],
					outputs: [{ id: 'out-4', title: 'OUT' }],
				},
			},
			{
				id: '5',
				type: 'graphNode',
				position: { x: 320, y: 220 },
				data: {
					kind: 'Agent',
					title: 'Routing Agent',
					inputs: [{ id: 'in-5', title: 'IN' }],
					outputs: [
						{ id: 'out-5a', title: 'TOOLS' },
						{ id: 'out-5b', title: 'RESULT' },
					],
				},
			},
			{
				id: '6',
				type: 'graphNode',
				position: { x: 640, y: 220 },
				data: {
					kind: 'Workspace',
					title: 'Prod Environment',
					inputs: [
						{ id: 'in-6a', title: 'CONFIG' },
						{ id: 'in-6b', title: 'ARTIFACTS' },
					],
					outputs: [],
				},
			},
		];

		const initialEdges: Edge[] = [
			// Top row chain
			{ id: 'e1-2', type: 'gradient', source: '1', sourceHandle: 'out-1', target: '2', targetHandle: 'in-2' },
			{ id: 'e2-3', type: 'gradient', source: '2', sourceHandle: 'out-2a', target: '3', targetHandle: 'in-3' },
			// Bottom row chain
			{ id: 'e4-5', type: 'gradient', source: '4', sourceHandle: 'out-4', target: '5', targetHandle: 'in-5' },
			{ id: 'e5-6', type: 'gradient', source: '5', sourceHandle: 'out-5b', target: '6', targetHandle: 'in-6a' },
			// Cross connection: Tool → Workspace ARTIFACTS
			{ id: 'e3-6-artifacts', type: 'gradient', source: '3', sourceHandle: 'out-3', target: '6', targetHandle: 'in-6b' },
		];

		function CanvasWrapper() {
			const [nodes, setNodes] = useState<Node<GraphNodeData>[]>(initialNodes);
			const [edges, setEdges] = useState<Edge[]>(initialEdges);

			const onNodesChange = useCallback(
				(changes: Parameters<typeof applyNodeChanges>[0]) =>
					setNodes((nds) => applyNodeChanges(changes, nds) as Node<GraphNodeData>[]),
				[],
			);

			const onEdgesChange = useCallback(
				(changes: Parameters<typeof applyEdgeChanges>[0]) =>
					setEdges((eds) => applyEdgeChanges(changes, eds)),
				[],
			);

			const onConnect = useCallback(
				(connection: Parameters<typeof addEdge>[0]) =>
					setEdges((eds) => addEdge({ ...connection, type: 'gradient' }, eds)),
				[],
			);

			// derive edge colors from connected node kinds
			const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));
			const coloredEdges = edges.map((edge) => {
				const sourceNode = nodesById[edge.source as string] as Node<GraphNodeData> | undefined;
				const targetNode = nodesById[edge.target as string] as Node<GraphNodeData> | undefined;
				const sourceKind = sourceNode?.data?.kind ?? 'Agent';
				const targetKind = targetNode?.data?.kind ?? 'Workspace';
				return {
					...edge,
					data: {
						...(edge.data || {}),
						sourceColor: nodeKindToColor[sourceKind],
						targetColor: nodeKindToColor[targetKind],
					},
				};
			});

			return (
				<div className="h-[600px] w-full bg-[var(--agyn-bg-light)]">
					<GraphCanvas
						nodes={nodes}
						edges={coloredEdges}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
						onConnect={onConnect}
						edgeTypes={{ gradient: GradientEdge }}
					/>
				</div>
			);
		}

		return <CanvasWrapper />;
	},
};
