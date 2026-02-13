import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Principal } from './auth.types';

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal | null => {
  const request = ctx.switchToHttp().getRequest<{ principal?: Principal | null }>();
  return request.principal ?? null;
});
