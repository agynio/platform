import type { AuthMode } from '../core/services/config.service';

export type PrincipalUser = {
  id: string;
  email: string | null;
  name: string | null;
};

export type Principal = {
  mode: AuthMode;
  userId: string;
  user: PrincipalUser;
  sessionId: string | null;
};

export type AuthStatusResponse = {
  mode: AuthMode;
  authenticated: boolean;
  user: PrincipalUser | null;
};

export type RequestWithPrincipal = import('fastify').FastifyRequest & {
  principal?: Principal | null;
  sessionId?: string | null;
};
