import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { EnvService } from './env.service';
import { ReferenceResolverService } from '../utils/reference-resolver.service';

@Module({
  imports: [VaultModule],
  providers: [EnvService, ReferenceResolverService],
  exports: [EnvService, ReferenceResolverService],
})
export class EnvModule {}
