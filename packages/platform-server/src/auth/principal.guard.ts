import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { RequestWithPrincipal } from './auth.types';
import { AuthService } from './auth.service';

@Injectable()
export class PrincipalGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const { principal, sessionId } = await this.authService.resolveRequestContext(request);
    request.principal = principal;
    request.sessionId = sessionId;
    return true;
  }
}
