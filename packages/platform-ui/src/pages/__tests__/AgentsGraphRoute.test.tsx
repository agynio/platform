vi.mock('@/components/agents/GraphLayout', () => ({
  GraphLayout: () => null,
}));

import { createRoutesFromChildren, type RouteObject } from 'react-router-dom';

import { AgentsGraphContainer } from '@/features/graph/containers/AgentsGraphContainer';
import { appRoutes } from '@/appRoutes.tsx';

function findRouteBySegments(routes: RouteObject[], segments: string[]): RouteObject | undefined {
  if (segments.length === 0) {
    return undefined;
  }

  const [head, ...rest] = segments;
  const current = routes.find((route) => route.path === head);
  if (!current) {
    return undefined;
  }

  if (rest.length === 0) {
    return current;
  }

  if (!current.children) {
    return undefined;
  }

  return findRouteBySegments(current.children, rest);
}

describe('Agents graph routing', () => {
  it('maps /agents/graph to AgentsGraphContainer', () => {
    const routeObjects = createRoutesFromChildren(appRoutes);
    const rootRoute = findRouteBySegments(routeObjects, ['/']);
    expect(rootRoute?.children).toBeDefined();

    const graphRoute = findRouteBySegments(rootRoute?.children ?? [], ['agents', 'graph']);
    expect(graphRoute).toBeDefined();
    expect(graphRoute?.element?.type).toBe(AgentsGraphContainer);
  });
});
