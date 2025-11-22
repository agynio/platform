import { ContainersScreen } from '@agyn/ui-new';

const placeholderContainers = [
  {
    id: 'placeholder',
    name: 'agents-workspace',
    containerId: 'container-placeholder',
    image: 'ghcr.io/agents/workspace:latest',
    role: 'workspace' as const,
    status: 'running' as const,
    startedAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    volumes: [],
  },
];

export function MonitoringContainersNew() {
  return <ContainersScreen containers={placeholderContainers} renderSidebar={false} />;
}
