import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { MongoService } from '../core/services/mongo.service';
import { VaultModule } from '../vault/vault.module';
import { ContainerRegistry } from './container/container.registry';
import { ContainerService } from './container/container.service';
import { ContainerCleanupService } from './container/containerCleanup.job';
import { GithubService } from './github/github.client';
import { PRService } from './github/pr.usecase';
import { NcpsKeyService } from './ncps/ncpsKey.service';
import { NixController } from './ncps/nix.controller';
import { ArchiveService } from './archive/archive.service';

@Module({
  imports: [CoreModule, VaultModule],
  providers: [
    ArchiveService,
    {
      provide: ContainerRegistry,
      useFactory: async (mongo: MongoService, logger: LoggerService) => {
        const svc = new ContainerRegistry(mongo.getDb(), logger);
        await svc.ensureIndexes();

        return svc;
      },
      inject: [MongoService, LoggerService],
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
        svc.init();
        return svc;
      },
      inject: [LoggerService, ContainerRegistry],
    },
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
  controllers: [NixController],
  exports: [
    VaultModule,
    ContainerService,
    ContainerCleanupService,
    NcpsKeyService,
    GithubService,
    PRService,
    ContainerRegistry,
    ArchiveService,
  ],
})
export class InfraModule {}
