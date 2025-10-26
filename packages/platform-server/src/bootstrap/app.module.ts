import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { GraphModule } from '../graph/graph.module';
import { NodesModule } from '../nodes/nodes.module';

@Module({ imports: [CoreModule, InfraModule, GraphModule, NodesModule] })
export class AppModule {
  constructor() {}
}
