import type { INestApplicationContext } from '@nestjs/common';
import { LoggerService } from '../core/services/logger.service';
import { ContainerService } from '../infra/container/container.service';
import { ContainerRegistry } from '../infra/container/container.registry';
import { ContainerCleanupService } from '../infra/container/containerCleanup.job';
import { GraphRepository } from '../graph/graph.repository';
import { AgentRunService } from '../nodes/agentRun.repository';

// Track started cleanup service instances to ensure idempotent start
const startedCleanupServices = new WeakSet<ContainerCleanupService>();

/**
 * Initializes and wires core platform services required at bootstrap.
 * Prefer resolving via Nest app.get; construct fallback cleanup service if not provided.
 */
export async function createPlatformServices(
  app: INestApplicationContext,
): Promise<{
  graphRepository: GraphRepository;
  agentRunService: AgentRunService;
  containerCleanupService: ContainerCleanupService;
  containerRegistryService: ContainerRegistry;
}> {
  // Resolve required services from DI
  const logger = app.get(LoggerService, { strict: false });
  const containerService = app.get(ContainerService, { strict: false });
  const graphRepository = app.get(GraphRepository, { strict: false });
  const containerRegistryService = app.get(ContainerRegistry, { strict: false });
  const agentRunService = app.get(AgentRunService, { strict: false });
  let containerCleanupService = app.get(ContainerCleanupService, { strict: false });

  // Defensive guards: required providers must exist
  if (!graphRepository) throw new Error('Missing GraphRepository provider');
  if (!containerRegistryService) throw new Error('Missing ContainerRegistry provider');
  if (!containerService) throw new Error('Missing ContainerService provider');
  if (!agentRunService) throw new Error('Missing AgentRunService provider');

  // Fallback construction if cleanup service not provided via DI
  if (!containerCleanupService) {
    containerCleanupService = new ContainerCleanupService(containerRegistryService, containerService, logger);
  }

  // Perform required initialization in order
  await graphRepository.initIfNeeded();
  await containerRegistryService.ensureIndexes();
  // Guarded above: containerService must be present
  await containerRegistryService.backfillFromDocker(containerService);
  await agentRunService.ensureIndexes();

  // Start background container cleanup idempotently
  if (!startedCleanupServices.has(containerCleanupService)) {
    containerCleanupService.start();
    startedCleanupServices.add(containerCleanupService);
  }

  return { graphRepository, agentRunService, containerCleanupService, containerRegistryService };
}
