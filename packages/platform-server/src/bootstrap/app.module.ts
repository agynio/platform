import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { CoreModule } from '../core/core.module';
import { EventsModule } from '../events/events.module';
import { GraphApiModule } from '../graph/graph-api.module';
import { GatewayModule } from '../gateway/gateway.module';
import { InfraModule } from '../infra/infra.module';
import { StartupRecoveryService } from '../core/services/startupRecovery.service';
import { NodesModule } from '../nodes/nodes.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { UserProfileModule } from '../user-profile/user-profile.module';

type PinoLoggerModule = {
  forRoot: (options: {
    pinoHttp?: {
      level?: string;
      customLogLevel?: (
        req: unknown,
        res: Readonly<{ statusCode?: number }> | undefined,
        error: unknown,
      ) => string;
      redact?: { paths: string[]; censor: string };
    };
  }) => DynamicModule;
};

const createLoggerModule = (): DynamicModule => {
  const moduleRef = LoggerModule as unknown as PinoLoggerModule;
  return moduleRef.forRoot({
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? 'info',
      customLogLevel: (_req, res, error) => {
        if (error instanceof Error) return 'error';
        const statusCode = typeof res?.statusCode === 'number' ? res.statusCode : undefined;
        if (typeof statusCode === 'number' && statusCode >= 500) return 'error';
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
  });
};

@Module({
  imports: [
    createLoggerModule(),
    CoreModule,
    EventsModule,
    InfraModule,
    GraphApiModule,
    NodesModule,
    GatewayModule,
    UserProfileModule,
    OnboardingModule,
  ],
  providers: [StartupRecoveryService],
  exports: [NodesModule],
})
export class AppModule {}
