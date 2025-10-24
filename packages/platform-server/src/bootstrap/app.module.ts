import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';

@Module({ imports: [CoreModule, InfraModule] })
export class AppModule {}
