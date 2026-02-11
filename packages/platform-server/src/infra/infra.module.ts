import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { PrismaService } from '../core/services/prisma.service';
import { VaultModule } from '../vault/vault.module';
import { ContainerRegistry } from './container/container.registry';
import { ContainerCleanupService } from './container/containerCleanup.job';
import { VolumeGcService } from './container/volumeGc.job';
import { ContainerThreadTerminationService } from './container/containerThreadTermination.service';
import { GithubService } from './github/github.client';
import { PRService } from './github/pr.usecase';
import { NcpsKeyService } from './ncps/ncpsKey.service';
import { NixController } from './ncps/nix.controller';
import { NixRepoController } from './ncps/nixRepo.controller';
import { ContainersController } from './container/containers.controller';
import { ArchiveService } from './archive/archive.service';
import { TerminalSessionsService } from './container/terminal.sessions.service';
import { ContainerTerminalGateway } from './container/terminal.gateway';
import { ContainerTerminalController } from './container/containerTerminal.controller';
import { ContainerEventProcessor } from './container/containerEvent.processor';
import { DockerWorkspaceEventsWatcher } from './container/containerEvent.watcher';
import { WorkspaceProvider } from '../workspace/providers/workspace.provider';
import { DockerWorkspaceRuntimeProvider } from '../workspace/providers/docker.workspace.provider';
import { DOCKER_CLIENT, type DockerClient } from './container/dockerClient.token';
import { HttpDockerRunnerClient } from './container/httpDockerRunner.client';

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
      provide: DOCKER_CLIENT,
      useFactory: (config: ConfigService) =>
        new HttpDockerRunnerClient({
          baseUrl: config.getDockerRunnerBaseUrl(),
          sharedSecret: config.getDockerRunnerSharedSecret(),
          requestTimeoutMs: config.getDockerRunnerTimeoutMs(),
        }),
      inject: [ConfigService],
    },
    {
      provide: ContainerCleanupService,
      useFactory: (registry: ContainerRegistry, containers: DockerClient) => {
        const svc = new ContainerCleanupService(registry, containers);
        svc.start();

        return svc;
      },
      inject: [ContainerRegistry, DOCKER_CLIENT],
    },
    {
      provide: VolumeGcService,
      useFactory: (prisma: PrismaService, containers: DockerClient) => {
        const svc = new VolumeGcService(prisma, containers);
        const interval = Number(process.env.VOLUME_GC_INTERVAL_MS ?? '') || 60_000;
        svc.start(interval);
        return svc;
      },
      inject: [PrismaService, DOCKER_CLIENT],
    },
    {
      provide: WorkspaceProvider,
      useFactory: (dockerClient: DockerClient) => new DockerWorkspaceRuntimeProvider(dockerClient),
      inject: [DOCKER_CLIENT],
    },
    TerminalSessionsService,
    ContainerTerminalGateway,
    ContainerThreadTerminationService,
    ContainerEventProcessor,
    {
      provide: DockerWorkspaceEventsWatcher,
      useFactory: (
        dockerClient: DockerClient,
        processor: ContainerEventProcessor,
      ) => {
        const watcher = new DockerWorkspaceEventsWatcher(dockerClient, processor);
        watcher.start();
        return watcher;
      },
      inject: [DOCKER_CLIENT, ContainerEventProcessor],
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
  controllers: [NixController, NixRepoController, ContainersController, ContainerTerminalController],
  exports: [
    VaultModule,
    DOCKER_CLIENT,
    ContainerCleanupService,
    VolumeGcService,
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
    WorkspaceProvider,
  ],
})
export class InfraModule {}
