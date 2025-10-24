import { Module } from '@nestjs/common';
import { MongoService } from '../core/services/mongo.service';
import { LoggerService } from '../core/services/logger.service';
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
        // idempotent start; service tracks its own timer
        try { svc.start(); } catch {}
        return svc;
      },
      inject: [ContainerRegistry, ContainerService, LoggerService],
    },
    ContainerService,
    NcpsKeyService,
    GithubService,
    PRService,
  ],
  controllers: [NixController],
  exports: [VaultModule, ContainerService, ContainerCleanupService, NcpsKeyService, GithubService, PRService, ContainerRegistry],
})
export class InfraModule {}
