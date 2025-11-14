import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { GraphModule } from '../graph/graph.module';
import { GraphSocketGateway } from '../gateway/graph.socket.gateway';
import { StartupRecoveryService } from '../core/services/startupRecovery.service';

@Module({ imports: [CoreModule, InfraModule, GraphModule], providers: [GraphSocketGateway, StartupRecoveryService] })
export class AppModule {
  constructor() {}
}
