import { Module } from '@nestjs/common';
import { ConfigService } from './services/config.service';
import { PrismaService } from './services/prisma.service';

@Module({
  providers: [
    { provide: ConfigService, useFactory: () => ConfigService.getInstance() },
    PrismaService,
  ],
  exports: [
    ConfigService, //
    PrismaService,
  ],
})
export class CoreModule {}
