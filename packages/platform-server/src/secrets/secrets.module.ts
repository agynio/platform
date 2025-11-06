import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { GraphModule } from '../graph/graph.module';
import { VaultModule } from '../vault/vault.module';
import { SecretsController } from './secrets.controller';
import { SecretsService } from './secrets.service';

@Module({
  imports: [CoreModule, GraphModule, VaultModule],
  controllers: [SecretsController],
  providers: [SecretsService],
  exports: [],
})
export class SecretsModule {}
