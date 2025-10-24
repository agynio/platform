import { Module } from '@nestjs/common';
import { CoreModule } from "../../core/core.module";
import { ConfigService } from "../../core/services/config.service";
import { LoggerService } from "../../core/services/logger.service";

import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';
import { VaultEnabledGuard } from './vault-enabled.guard';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: VaultService,
      useFactory: (config: ConfigService, logger: LoggerService) => new VaultService(config, logger),
      inject: [ConfigService, LoggerService],
    },
    VaultEnabledGuard,
  ],
  controllers: [VaultController],
  exports: [VaultService],
})
export class VaultModule {}
