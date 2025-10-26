import { Module } from '@nestjs/common';
import { VaultService } from './vault.service';
import { VaultController } from './vault.controller';
import { VaultEnabledGuard } from './vault-enabled.guard';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [CoreModule],
  providers: [VaultService, VaultEnabledGuard],
  controllers: [VaultController],
  exports: [VaultService],
})
export class VaultModule {}
