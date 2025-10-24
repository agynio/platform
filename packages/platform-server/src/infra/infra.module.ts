import { Module } from '@nestjs/common';
import { MongoService } from '../core/services/mongo.service';
import { LoggerService } from '../core/services/logger.service';
import { ConfigService } from '../core/services/config.service';
import { NixController } from './ncps/nix.controller';
import { ContainerService } from './container/container.service';
import { VaultModule } from './vault/vault.module';
import { ContainerCleanupService } from './container/containerCleanup.job';
import { ContainerRegistry } from './container/container.registry';
import { NcpsKeyService } from './ncps/ncpsKey.service';
import { GithubService } from './github/github.client';
import { PRService } from './github/pr.usecase';

@Module({
  imports: [VaultModule],
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
