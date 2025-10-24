import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { NcpsModule } from '../infra/ncps/nix.module';

@Module({ imports: [CoreModule, NcpsModule] })
export class AppModule {}
