import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service.js';
import { LoggerService } from './services/logger.service.js';
import { MongoService } from './services/mongo.service.js';
import { ContainerService } from './services/container.service.js';
import { VaultService } from './services/vault.service.js';
import { NcpsKeyService } from './services/ncpsKey.service.js';
import { LLMFactoryService } from './services/llmFactory.service.js';

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
