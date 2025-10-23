import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';

@Module({ imports: [CoreModule] })
export class AppModule {}
