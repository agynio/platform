import { Module } from '@nestjs/common';
import { Db } from 'mongodb';
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
      useFactory: async (configService: ConfigService, logger: LoggerService) => {
        const mongo = new MongoService(configService, logger);
        await mongo.connect();
        return mongo;
      },
      inject: [ConfigService, LoggerService],
    },
    {
      // Provide raw Mongo Db token for direct injection (e.g., MemoryNode)
      provide: Db as any,
      useFactory: (mongo: MongoService) => mongo.getDb(),
      inject: [MongoService],
    },
    PrismaService,
  ],
  exports: [
    ConfigService, //
    LoggerService,
    MongoService,
    Db as any,
    PrismaService,
  ],
})
export class CoreModule {}
