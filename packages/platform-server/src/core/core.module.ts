import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { MongoService } from './services/mongo.service';
import { LLMFactoryService } from '../llm/llmFactory.service';
import { EnvService } from './env.resolver';
import { PrismaService } from './services/prisma.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    MongoService,
    LLMFactoryService,
    EnvService,
    PrismaService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    MongoService,
    LLMFactoryService,
    EnvService,
    PrismaService,
  ],
})
export class CoreModule {}
