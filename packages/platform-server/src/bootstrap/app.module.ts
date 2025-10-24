import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { GraphModule } from '../graph/graph.module';

@Module({ imports: [CoreModule, InfraModule, GraphModule] })
export class AppModule {}
