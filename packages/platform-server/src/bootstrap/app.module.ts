import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { GraphModule } from '../graph/graph.module';
import { InfraModule } from '../infra/infra.module';
import { NodesModule } from '../nodes/nodes.module';

@Module({ imports: [CoreModule, InfraModule, NodesModule, GraphModule] })
export class AppModule {
  constructor() {}
}
