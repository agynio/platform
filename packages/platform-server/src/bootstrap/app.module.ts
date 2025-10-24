import { Module, Inject } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { NodesModule } from '../nodes/nodes.module';
import { GraphModule } from '../graph/graph.module';

@Module({ imports: [CoreModule, InfraModule, NodesModule, GraphModule] })
export class AppModule {
  // Force eager instantiation of bootstrap/initializer providers
  constructor(
    @Inject('GraphModuleBootstrap') _bootstrap: unknown,
    @Inject('LiveGraphRuntimeInitializer') _runtimeInit: unknown,
  ) {}
}
