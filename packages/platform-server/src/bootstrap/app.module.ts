import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { CoreModule } from '../core/core.module';
import { EventsModule } from '../events/events.module';
import { GraphApiModule } from '../graph/graph-api.module';
import { GatewayModule } from '../gateway/gateway.module';
import { InfraModule } from '../infra/infra.module';
import { StartupRecoveryService } from '../core/services/startupRecovery.service';
import { NodesModule } from '../nodes/nodes.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        customLogLevel: (_req, res, error) => {
          if (error) return 'error';
          if (res && typeof res.statusCode === 'number' && res.statusCode >= 500) return 'error';
          return 'silent';
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers.set-cookie',
            'req.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
    CoreModule,
    EventsModule,
    InfraModule,
    GraphApiModule,
    NodesModule,
    GatewayModule,
  ],
  providers: [StartupRecoveryService],
  exports: [NodesModule],
})
export class AppModule {}
