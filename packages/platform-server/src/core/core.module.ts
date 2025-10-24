import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { MongoService } from './services/mongo.service';
import { PrismaService } from './services/prisma.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    MongoService,
    PrismaService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    MongoService,
    PrismaService,
  ],
})
export class CoreModule {}
