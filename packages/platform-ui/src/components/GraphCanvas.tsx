import React from 'react';
import {
	ReactFlow, 
	ReactFlowProvider,
	Background,
	Controls,
	MiniMap,
	SelectionMode,
	useReactFlow,
	type Node,
	type Edge,
	type OnNodesChange,
	type OnEdgesChange,
	type OnConnect,
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

interface GraphCanvasProps {
	nodes: Node<GraphNodeData>[];
	edges: Edge[];
	onNodesChange: OnNodesChange;
	onEdgesChange: OnEdgesChange;
	onConnect: OnConnect;
	nodeTypes?: Record<string, React.ComponentType<any>>;
	edgeTypes?: Record<string, React.ComponentType<any>>;
	onDrop?: (event: React.DragEvent) => void;
	onDragOver?: (event: React.DragEvent) => void;
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
}: Omit<GraphCanvasProps, 'nodeTypes'> & { nodeTypes: Record<string, React.ComponentType<any>> }) {
	const reactFlowInstance = useReactFlow();

	const handleDragOver = React.useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
		if (onDragOver) {
			onDragOver(event);
		}
	}, [onDragOver]);

	const handleDrop = React.useCallback((event: React.DragEvent) => {
		event.preventDefault();

		const data = event.dataTransfer.getData('application/reactflow');
		if (!data) return;

		const nodeData = JSON.parse(data);
		const position = reactFlowInstance.screenToFlowPosition({
			x: event.clientX,
			y: event.clientY,
		});

		if (onDrop) {
			// Pass both the event and position data
			const customEvent = event as any;
			customEvent.flowPosition = position;
			customEvent.nodeData = nodeData;
			onDrop(customEvent);
		}
	}, [reactFlowInstance, onDrop]);

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
