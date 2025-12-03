import React, { type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GraphCanvas } from '../GraphCanvas';

const reactFlowPropsSpy = vi.fn();

vi.mock('@xyflow/react', () => {
	return {
		ReactFlowProvider: ({ children }: { children?: ReactNode }) => (
			<div data-testid="react-flow-provider-mock">{children}</div>
		),
		ReactFlow: (props: any) => {
			reactFlowPropsSpy(props);
			return <div data-testid="react-flow-mock">{props.children}</div>;
		},
		Background: () => <div data-testid="react-flow-background" />,
		Controls: () => <div data-testid="react-flow-controls" />,
		MiniMap: () => <div data-testid="react-flow-minimap" />,
		SelectionMode: { Partial: 'partial' },
		useReactFlow: () => ({
			screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
		}),
	};
});

describe('GraphCanvas', () => {
	beforeEach(() => {
		reactFlowPropsSpy.mockClear();
	});

	it('forwards onNodesDelete and sets tabIndex for keyboard interactions', () => {
		const nodesDeleteHandler = vi.fn();

		render(
			<GraphCanvas
				nodes={[]}
				edges={[]}
				onNodesChange={vi.fn()}
				onEdgesChange={vi.fn()}
				onConnect={vi.fn()}
				onNodesDelete={nodesDeleteHandler}
			/>,
		);

		expect(reactFlowPropsSpy).toHaveBeenCalled();
		const props = reactFlowPropsSpy.mock.calls.at(-1)?.[0] ?? {};
		expect(props.onNodesDelete).toBe(nodesDeleteHandler);
		expect(props.tabIndex).toBe(0);
	});
});
