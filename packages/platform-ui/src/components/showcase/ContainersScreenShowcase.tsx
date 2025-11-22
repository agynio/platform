import ContainersScreen, { Container, ContainerStatus } from '../screens/ContainersScreen';

// Generate sample containers
const generateSampleContainers = (): Container[] => {
  const containers: Container[] = [];
  const now = Date.now();

  const images = [
    'python:3.11-slim',
    'node:20-alpine',
    'postgres:15',
    'redis:7-alpine',
    'nginx:alpine',
    'mongo:7',
    'ubuntu:22.04',
    'alpine:latest',
  ];

  const statuses: ContainerStatus[] = ['running', 'stopped', 'starting', 'stopping'];

  // Generate 50 main containers
  for (let i = 0; i < 50; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const startedHoursAgo = Math.floor(Math.random() * 48);
    const lastUsedHoursAgo = Math.floor(Math.random() * startedHoursAgo);
    const ttlHours = status === 'running' ? Math.floor(Math.random() * 12) + 1 : undefined;

    const startedAt = new Date(now - startedHoursAgo * 60 * 60 * 1000);
    const lastUsedAt = new Date(now - lastUsedHoursAgo * 60 * 60 * 1000);
    const ttl = ttlHours
      ? new Date(now + ttlHours * 60 * 60 * 1000).toISOString()
      : undefined;

    const numVolumes = Math.floor(Math.random() * 4);
    const volumes: string[] = [];
    for (let v = 0; v < numVolumes; v++) {
      volumes.push(`/data/volume-${i}-${v}:/app/data-${v}`);
    }

    const container: Container = {
      id: `container-${i}`,
      name: `agyn-worker-${i + 1}`,
      containerId: `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      image: images[Math.floor(Math.random() * images.length)],
      role: 'workspace',
      status,
      startedAt: startedAt.toISOString(),
      lastUsedAt: lastUsedAt.toISOString(),
      ttl,
      volumes,
      threadId: Math.random() > 0.3 ? `thread-${Math.floor(Math.random() * 1000)}` : undefined,
    };

    containers.push(container);

    // Add DinD containers for some workspaces
    if (i % 3 === 0 && i < 15) {
      const dindCount = Math.floor(Math.random() * 2) + 1;
      for (let s = 0; s < dindCount; s++) {
        const dindStatus = status === 'running' ? 'running' : 'stopped';
        const dind: Container = {
          id: `container-${i}-dind-${s}`,
          name: `agyn-worker-${i + 1}-dind-${s + 1}`,
          containerId: `${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
          image: s === 0 ? 'docker:dind' : 'docker:24-dind',
          role: 'dind',
          status: dindStatus,
          startedAt: startedAt.toISOString(),
          lastUsedAt: lastUsedAt.toISOString(),
          ttl,
          volumes: [],
          parentId: container.id,
          threadId: Math.random() > 0.5 ? `thread-${Math.floor(Math.random() * 1000)}` : undefined,
        };
        containers.push(dind);
      }
    }
  }

  return containers;
};

interface ContainersScreenShowcaseProps {
  onBack?: () => void;
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

export default function ContainersScreenShowcase({ onBack, selectedMenuItem, onMenuItemSelect }: ContainersScreenShowcaseProps) {
  const containers = generateSampleContainers();

  const handleOpenTerminal = (containerId: string) => {
    console.log('Open terminal:', containerId);
  };

  const handleDeleteContainer = (containerId: string) => {
    console.log('Delete container:', containerId);
  };

  const handleViewThread = (threadId: string) => {
    console.log('View thread:', threadId);
  };

  return (
    <ContainersScreen
      containers={containers}
      onOpenTerminal={handleOpenTerminal}
      onDeleteContainer={handleDeleteContainer}
      onViewThread={handleViewThread}
      onBack={onBack}
      selectedMenuItem={selectedMenuItem}
      onMenuItemSelect={onMenuItemSelect}
    />
  );
}
