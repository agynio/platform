import { Module } from '@nestjs/common';
import { ContainerService } from './container/container.service';
import { VaultService } from './vault/vault.service';

@Module({
  providers: [ContainerService, VaultService],
  exports: [ContainerService, VaultService],
})
export class InfraModule {}
