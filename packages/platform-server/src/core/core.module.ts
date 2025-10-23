import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { MongoService } from './services/mongo.service';
import { NcpsKeyService } from './services/ncpsKey.service';
import { LLMFactoryService } from '../llm/llmFactory.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    MongoService,
    NcpsKeyService,
    LLMFactoryService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    MongoService,
    NcpsKeyService,
    LLMFactoryService,
  ],
})
export class CoreModule {}
