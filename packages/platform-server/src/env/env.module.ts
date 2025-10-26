import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { EnvService } from './env.service';

@Module({
  imports: [VaultModule],
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule {}
