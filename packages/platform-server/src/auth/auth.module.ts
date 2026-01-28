import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from '../core/core.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { UserService } from './user.service';
import { OidcService } from './oidc.service';
import { LoginStateStore } from './login-state.store';
import { PrincipalGuard } from './principal.guard';
import { AuthenticatedGuard } from './authenticated.guard';

@Global()
@Module({
  imports: [CoreModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    UserService,
    OidcService,
    LoginStateStore,
    {
      provide: APP_GUARD,
      useClass: PrincipalGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthenticatedGuard,
    },
  ],
  exports: [AuthService, SessionService, UserService],
})
export class AuthModule {}
