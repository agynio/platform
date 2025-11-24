import React from 'react';
import {
	ReactFlow,
	ReactFlowProvider,
	Background,
	Controls,
	MiniMap,
	SelectionMode,
	useReactFlow,
	type Edge,
	type EdgeTypes,
	type Node,
	type NodeTypes,
	type OnConnect,
	type OnEdgesChange,
	type OnNodesChange,
	type XYPosition,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import NodeComponent, { type NodeKind } from './Node';
import { SavingStatusControl, type SavingStatus } from './SavingStatusControl';

export type GraphNodeData = {
	kind: NodeKind;
	title?: string;
	inputs?: { id: string; title: string }[];
	outputs?: { id: string; title: string }[];
	avatar?: string;
	avatarSeed?: string;
};

const DRAGGABLE_NODE_KINDS: NodeKind[] = ['Trigger', 'Agent', 'Tool', 'MCP', 'Workspace'];

function isDraggedNodeData(value: unknown): value is GraphCanvasDragData {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	const { id, kind, title } = candidate;
	return (
		typeof id === 'string' &&
		typeof title === 'string' &&
		typeof kind === 'string' &&
		DRAGGABLE_NODE_KINDS.includes(kind as NodeKind)
	);
}

export interface GraphCanvasDragData {
	id: string;
	kind: NodeKind;
	title: string;
	description?: string;
}

export interface GraphCanvasDropContext {
	position: XYPosition;
	data: GraphCanvasDragData;
}

export type GraphCanvasDropHandler = (
	event: React.DragEvent<HTMLDivElement>,
	context: GraphCanvasDropContext,
) => void;

interface GraphCanvasProps {
	nodes: Node<GraphNodeData>[];
	edges: Edge[];
	onNodesChange: OnNodesChange;
	onEdgesChange: OnEdgesChange;
	onConnect: OnConnect;
	nodeTypes?: NodeTypes;
	edgeTypes?: EdgeTypes;
	onDrop?: GraphCanvasDropHandler;
	onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
	savingStatus?: SavingStatus;
	savingErrorMessage?: string;
}

export function GraphCanvas({
	nodes,
	edges,
	onNodesChange,
	onEdgesChange,
	onConnect,
	nodeTypes,
	edgeTypes,
	onDrop,
	onDragOver,
	savingStatus,
	savingErrorMessage,
}: GraphCanvasProps) {
	const defaultNodeTypes = React.useMemo(
		() => ({
			graphNode: ({ data, selected }: { data: GraphNodeData; selected?: boolean }) => (
				<NodeComponent
					kind={data.kind}
					title={data.title}
					inputs={data.inputs}
					outputs={data.outputs}
					avatar={data.avatar}
					avatarSeed={data.avatarSeed}
					selected={selected}
				/>
			),
		}),
		[],
	);

	const mergedNodeTypes = nodeTypes ? { ...defaultNodeTypes, ...nodeTypes } : defaultNodeTypes;

	return (
		<ReactFlowProvider>
			<ReactFlowInner
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				nodeTypes={mergedNodeTypes}
				edgeTypes={edgeTypes}
				onDrop={onDrop}
				onDragOver={onDragOver}
				savingStatus={savingStatus}
				savingErrorMessage={savingErrorMessage}
			/>
		</ReactFlowProvider>
	);
}

function ReactFlowInner({
	nodes,
	edges,
	onNodesChange,
	onEdgesChange,
	onConnect,
	nodeTypes,
	edgeTypes,
	onDrop,
	onDragOver,
	savingStatus,
	savingErrorMessage,
}: Omit<GraphCanvasProps, 'nodeTypes'> & { nodeTypes: NodeTypes }) {
	const reactFlowInstance = useReactFlow();

	const handleDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		if (onDragOver) {
			onDragOver(event);
		}
	}, [onDragOver]);

	const handleDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>) => {
		event.preventDefault();

		const data = event.dataTransfer.getData('application/reactflow');
		if (!data) {
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(data);
		} catch {
			return;
		}

		if (!isDraggedNodeData(parsed)) {
			return;
		}
		const position = reactFlowInstance.screenToFlowPosition({
			x: event.clientX,
			y: event.clientY,
		});

		onDrop?.(event, { position, data: parsed });
	}, [onDrop, reactFlowInstance]);

	return (
		<div className="w-full h-full">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				panOnScroll
				panOnScrollSpeed={2}
				selectionOnDrag
				panOnDrag={[1]}
				selectionMode={SelectionMode.Partial}
				fitView
			>
				<Background gap={16} size={1} />
				<MiniMap pannable zoomable />
				<Controls />
			</ReactFlow>
			{savingStatus && (
				<div className="absolute top-4 right-4 z-10">
					<SavingStatusControl status={savingStatus} errorMessage={savingErrorMessage} />
				</div>
			)}
		</div>
	);
}
