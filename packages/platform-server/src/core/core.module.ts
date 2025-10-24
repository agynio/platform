import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { LoggerService } from './services/logger.service';
import { MongoService } from './services/mongo.service';
import { PrismaService } from './services/prisma.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.fromEnv() },
    LoggerService,
    {
      provide: MongoService,
      useFactory: (configService: ConfigService, logger: LoggerService) => {
        // Construct service only; avoid connecting at provider time.
        const mongo = new MongoService(configService, logger);
        await mongo.connect();
        return mongo;
      },
      inject: [ConfigService, LoggerService],
    },
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
