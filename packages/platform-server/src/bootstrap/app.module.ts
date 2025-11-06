import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { GraphModule } from '../graph/graph.module';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';

@Module({ imports: [CoreModule, InfraModule, GraphModule, SecretsModule], providers: [GraphSocketGateway] })
export class AppModule {
  constructor() {}
}
// import SecretsModule (added by Rowan at 2025-11-06T03:31:49Z)
