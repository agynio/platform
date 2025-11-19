import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { PrismaService } from './services/prisma.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    PrismaService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    PrismaService,
  ],
})
export class CoreModule {}
