import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { GraphModule } from '../graph/graph.module';
import { NodesModule } from '../nodes/nodes.module';
import { VariablesModule } from '../variables/variables.module';

@Module({ imports: [CoreModule, InfraModule, GraphModule, NodesModule, VariablesModule] })
export class AppModule {
  constructor() {}
}
