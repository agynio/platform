import { Module } from '@nestjs/common';
import { CoreModule } from '../../core/core.module';
import { NixController } from './nix.controller';

@Module({
  imports: [CoreModule],
  controllers: [NixController],
})
export class NcpsModule {}

