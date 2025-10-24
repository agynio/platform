import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { LoggerService } from '../core/services/logger.service';
import { MongoService } from '../core/services/mongo.service';
import { ContainerRegistry } from './container/container.registry';
import { ContainerService } from './container/container.service';
import { ContainerCleanupService } from './container/containerCleanup.job';
import { GithubService } from './github/github.client';
import { PRService } from './github/pr.usecase';
import { NcpsKeyService } from './ncps/ncpsKey.service';
import { NixController } from './ncps/nix.controller';
import { VaultModule } from './vault/vault.module';

@Module({
  imports: [CoreModule, VaultModule],
  providers: [
    {
      provide: ContainerRegistry,
      useFactory: async (mongo: MongoService, logger: LoggerService, containers: ContainerService) => {
        const svc = new ContainerRegistry(mongo.getDb(), logger);
        await svc.ensureIndexes();
        await svc.backfillFromDocker(containers);

        return svc;
      },
      inject: [MongoService, LoggerService, ContainerService],
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
    ContainerService,
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
  ],
})
export class InfraModule {}
