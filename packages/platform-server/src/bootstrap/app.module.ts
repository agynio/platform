import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { InfraModule } from '../infra/infra.module';
import { GraphApiModule } from '../graph/graph-api.module';
import { GatewayModule } from '../gateway/gateway.module';
import { StartupRecoveryService } from '../core/services/startupRecovery.service';

@Module({ imports: [CoreModule, InfraModule, GraphApiModule, GatewayModule], providers: [StartupRecoveryService] })
export class AppModule {
  constructor() {}
}
