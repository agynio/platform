import type { INestApplicationContext } from '@nestjs/common';
import { LoggerService } from '../core/services/logger.service';
import { ContainerService } from '../infra/container/container.service';
import { ContainerRegistry } from '../infra/container/container.registry';
import { ContainerCleanupService } from '../infra/container/containerCleanup.job';
import { GraphRepository } from '../graph/graph.repository';
import { AgentRunService } from '../nodes/agentRun.repository';

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

  // Fallback construction if cleanup service not provided via DI
  if (!containerCleanupService) {
    containerCleanupService = new ContainerCleanupService(containerRegistryService, containerService, logger);
  }

  // Perform required initialization in order
  await graphRepository.initIfNeeded();
  await containerRegistryService.ensureIndexes();
  await containerRegistryService.backfillFromDocker(containerService);
  await agentRunService.ensureIndexes();

  // Start background container cleanup
  containerCleanupService.start();

  return { graphRepository, agentRunService, containerCleanupService, containerRegistryService };
}

