import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';
import { SessionService } from './session.service';
import { UserService } from './user.service';
import { OidcService } from './oidc.service';
import { LoginStateStore } from './login-state.store';
import { ConfigService, type AuthMode } from '../core/services/config.service';
import type { AuthStatusResponse, Principal } from './auth.types';

const generateCodeVerifier = (): string => randomBytes(32).toString('base64url');
const generateCodeChallenge = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');
const generateNonce = (): string => randomBytes(16).toString('base64url');
type TokenClaims = {
  sub?: unknown;
  email?: unknown;
  name?: unknown;
  preferred_username?: unknown;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(UserService) private readonly users: UserService,
    @Inject(OidcService) private readonly oidc: OidcService,
    @Inject(LoginStateStore) private readonly loginStates: LoginStateStore,
  ) {}

  get mode(): AuthMode {
    return this.config.authMode;
  }

  async resolveRequestContext(request: FastifyRequest): Promise<{ principal: Principal | null; sessionId: string | null }> {
    if (this.mode === 'single_user') {
      const principal = await this.getDefaultPrincipal();
      return { principal, sessionId: null };
    }
    const sessionId = this.sessions.readSessionIdFromRequest(request);
    if (!sessionId) return { principal: null, sessionId: null };
    const principal = await this.buildPrincipalFromSession(sessionId);
    return { principal, sessionId: principal ? sessionId : null };
  }

  async resolvePrincipalFromCookieHeader(cookieHeader: string | undefined): Promise<Principal | null> {
    if (this.mode === 'single_user') {
      return this.getDefaultPrincipal();
    }
    const sessionId = this.sessions.readSessionIdFromCookieHeader(cookieHeader);
    if (!sessionId) return null;
    return this.buildPrincipalFromSession(sessionId);
  }

  async getAuthStatus(principal: Principal | null): Promise<AuthStatusResponse> {
    if (this.mode === 'single_user') {
      const defaultPrincipal = await this.getDefaultPrincipal();
      return {
        mode: this.mode,
        authenticated: true,
        user: defaultPrincipal.user,
      };
    }
    return {
      mode: this.mode,
      authenticated: !!principal,
      user: principal?.user ?? null,
    };
  }

  async initiateLogin(reply: FastifyReply): Promise<void> {
    if (this.mode !== 'oidc') {
      reply.status(204).send();
      return;
    }
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const nonce = generateNonce();
    const state = this.loginStates.create({ codeVerifier, nonce });
    const url = await this.oidc.getAuthorizationUrl({
      state,
      nonce,
      codeChallenge,
      scopes: this.config.oidcScopes,
    });
    reply.redirect(url);
  }

  async handleOidcCallback(params: { state: string; code: string }, reply: FastifyReply): Promise<void> {
    if (this.mode !== 'oidc') {
      throw new BadRequestException({ error: 'oidc_disabled' });
    }
    const loginState = this.loginStates.consume(params.state);
    if (!loginState) {
      throw new BadRequestException({ error: 'invalid_state' });
    }
    const tokenSet = await this.oidc.handleCallback({
      state: params.state,
      code: params.code,
      nonce: loginState.nonce,
      codeVerifier: loginState.codeVerifier,
    });
    const claims = tokenSet.claims() as TokenClaims;
    const subject = typeof claims.sub === 'string' ? claims.sub : null;
    if (!subject) {
      throw new UnauthorizedException({ error: 'missing_subject' });
    }
    const email = typeof claims.email === 'string' ? claims.email : null;
    const name =
      typeof claims.name === 'string'
        ? claims.name
        : typeof claims.preferred_username === 'string'
          ? claims.preferred_username
          : email;
    const user = await this.users.upsertOidcUser({
      issuer: this.config.oidcIssuerUrl,
      subject,
      email,
      name,
    });
    const session = await this.sessions.create(user.id);
    reply.header('Set-Cookie', this.sessions.serializeCookie(session.id, session.expiresAt));
    reply.redirect(this.config.oidcPostLoginRedirect);
  }

  async logout(reply: FastifyReply, sessionId: string | null): Promise<void> {
    if (sessionId) {
      await this.sessions.delete(sessionId);
    }
    reply.header('Set-Cookie', this.sessions.serializeClearCookie());
    reply.status(204).send();
  }

  private async buildPrincipalFromSession(sessionId: string): Promise<Principal | null> {
    const session = await this.sessions.get(sessionId);
    if (!session) return null;
    const user = await this.users.getById(session.userId);
    if (!user) {
      await this.sessions.delete(session.id);
      return null;
    }
    return {
      mode: this.mode,
      userId: user.id,
      sessionId,
      user: {
        id: user.id,
        email: user.email ?? null,
        name: user.name ?? null,
      },
    };
  }

  private async getDefaultPrincipal(): Promise<Principal> {
    const user = await this.users.ensureDefaultUser();
    return {
      mode: 'single_user',
      userId: user.id,
      sessionId: null,
      user: {
        id: user.id,
        email: user.email ?? null,
        name: user.name ?? null,
      },
    };
  }
}
