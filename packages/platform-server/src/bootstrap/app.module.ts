import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { GraphModule } from '../graph/graph.module';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';

@Module({ imports: [CoreModule, InfraModule, GraphModule], providers: [GraphSocketGateway] })
export class AppModule {
  constructor() {}
}
