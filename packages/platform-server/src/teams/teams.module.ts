import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { ConfigService } from '../core/services/config.service';
import { TeamsGrpcClient } from './teamsGrpc.client';
import { TEAMS_GRPC_CLIENT } from './teamsGrpc.token';

@Module({
  imports: [CoreModule],
  providers: [
    {
      provide: TEAMS_GRPC_CLIENT,
      useFactory: (config: ConfigService) =>
        new TeamsGrpcClient({
          address: config.teamsServiceAddr,
        }),
      inject: [ConfigService],
    },
  ],
  exports: [TEAMS_GRPC_CLIENT],
})
export class TeamsModule {}
