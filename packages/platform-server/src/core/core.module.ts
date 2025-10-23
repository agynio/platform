import { Module } from '@nestjs/common';
import { ConfigService } from './core/services/config.service';
import { LoggerService } from './core/services/logger.service';
import { MongoService } from './core/services/mongo.service';
import { ContainerService } from './core/services/container.service';
import { VaultService } from './core/services/vault.service';
import { NcpsKeyService } from './core/services/ncpsKey.service';
import { LLMFactoryService } from './core/services/llmFactory.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    MongoService,
    ContainerService,
    VaultService,
    NcpsKeyService,
    LLMFactoryService,
  ],
  exports: [ConfigService, LoggerService, MongoService, ContainerService, VaultService, NcpsKeyService, LLMFactoryService],
})
export class CoreModule {}
