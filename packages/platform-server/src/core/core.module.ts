import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { MongoService } from './services/mongo.service';
import { LLMFactoryService } from '../llm/llmFactory.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    MongoService,
    LLMFactoryService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    MongoService,
    LLMFactoryService,
  ],
})
export class CoreModule {}
