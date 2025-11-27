import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { PrismaService } from '../core/services/prisma.service';
import { VaultModule } from '../vault/vault.module';
import { ContainerRegistry } from './container/container.registry';
import { ContainerService } from './container/container.service';
import { ContainerCleanupService } from './container/containerCleanup.job';
import { ContainerThreadTerminationService } from './container/containerThreadTermination.service';
import { GithubService } from './github/github.client';
import { PRService } from './github/pr.usecase';
import { NcpsKeyService } from './ncps/ncpsKey.service';
import { NixController } from './ncps/nix.controller';
import { ContainersController } from './container/containers.controller';
import { ArchiveService } from './archive/archive.service';
import { TerminalSessionsService } from './container/terminal.sessions.service';
import { ContainerTerminalGateway } from './container/terminal.gateway';
import { ContainerTerminalController } from './container/containerTerminal.controller';
import { ContainerEventProcessor } from './container/containerEvent.processor';
import { DockerWorkspaceEventsWatcher } from './container/containerEvent.watcher';

@Module({
  imports: [CoreModule, VaultModule],
  providers: [
    ArchiveService,
    {
      provide: ContainerRegistry,
      useFactory: async (prismaSvc: PrismaService) => {
        const svc = new ContainerRegistry(prismaSvc.getClient());
        await svc.ensureIndexes();
        return svc;
      },
      inject: [PrismaService],
    },
    {
      provide: ContainerCleanupService,
      useFactory: (registry: ContainerRegistry, containers: ContainerService) => {
        const svc = new ContainerCleanupService(registry, containers);
        svc.start();

        return svc;
      },
      inject: [ContainerRegistry, ContainerService],
    },
    {
      provide: ContainerService,
      useFactory: (containerRegistry: ContainerRegistry) => {
        return new ContainerService(containerRegistry);
      },
      inject: [ContainerRegistry],
    },
    TerminalSessionsService,
    ContainerTerminalGateway,
    ContainerThreadTerminationService,
    ContainerEventProcessor,
    {
      provide: DockerWorkspaceEventsWatcher,
      useFactory: (
        containerService: ContainerService,
        processor: ContainerEventProcessor,
      ) => {
        const watcher = new DockerWorkspaceEventsWatcher(containerService, processor);
        watcher.start();
        return watcher;
      },
      inject: [ContainerService, ContainerEventProcessor],
    },
    {
      provide: NcpsKeyService,
      useFactory: async (config: ConfigService) => {
        const svc = new NcpsKeyService(config);
        await svc.init();

        return svc;
      },
      inject: [ConfigService],
    },
    GithubService,
    PRService,
  ],
  controllers: [NixController, ContainersController, ContainerTerminalController],
  exports: [
    VaultModule,
    ContainerService,
    ContainerCleanupService,
    TerminalSessionsService,
    ContainerTerminalGateway,
    ContainerThreadTerminationService,
    ContainerEventProcessor,
    DockerWorkspaceEventsWatcher,
    NcpsKeyService,
    GithubService,
    PRService,
    ContainerRegistry,
    ArchiveService,
  ],
})
export class InfraModule {}
