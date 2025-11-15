import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
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

@Module({
  imports: [CoreModule, VaultModule],
  providers: [
    ArchiveService,
    {
      provide: ContainerRegistry,
      useFactory: async (prismaSvc: PrismaService, logger: LoggerService) => {
        const svc = new ContainerRegistry(prismaSvc.getClient(), logger);
        await svc.ensureIndexes();
        return svc;
      },
      inject: [PrismaService, LoggerService],
    },
    {
      provide: ContainerCleanupService,
      useFactory: (registry: ContainerRegistry, containers: ContainerService, logger: LoggerService) => {
        const svc = new ContainerCleanupService(registry, containers, logger);
        svc.start();

        return svc;
      },
      inject: [ContainerRegistry, ContainerService, LoggerService],
    },
    {
      provide: ContainerService,
      useFactory: (logger: LoggerService, containerRegistry: ContainerRegistry) => {
        const svc = new ContainerService(logger, containerRegistry);
        return svc;
      },
      inject: [LoggerService, ContainerRegistry],
    },
    TerminalSessionsService,
    ContainerTerminalGateway,
    ContainerThreadTerminationService,
    {
      provide: NcpsKeyService,
      useFactory: async (config: ConfigService, logger: LoggerService) => {
        const svc = new NcpsKeyService(config, logger);
        await svc.init();

        return svc;
      },
      inject: [ConfigService, LoggerService],
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
    NcpsKeyService,
    GithubService,
    PRService,
    ContainerRegistry,
    ArchiveService,
  ],
})
export class InfraModule {}
