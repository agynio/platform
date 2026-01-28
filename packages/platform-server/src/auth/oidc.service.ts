import { Inject, Injectable } from '@nestjs/common';
import * as openidClient from 'openid-client';
import { ConfigService } from '../core/services/config.service';

export type TokenSetResult = {
  claims(): Record<string, unknown>;
};

type AuthorizationClient = {
  authorizationUrl(params: {
    state: string;
    nonce: string;
    scope: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: 'S256';
  }): string;
  callback(
    redirectUri: string,
    parameters: { code: string; state: string },
    checks: { state: string; nonce: string; code_verifier: string },
  ): Promise<TokenSetResult>;
};

type IssuerApi = {
  discover(issuerUrl: string): Promise<{ Client: new (metadata: ClientMetadata) => AuthorizationClient }>;
};

type ClientMetadata = {
  client_id: string;
  client_secret?: string;
  redirect_uris: [string];
  response_types: [string];
  token_endpoint_auth_method: 'client_secret_basic' | 'none';
};

const issuerApi = (openidClient as unknown as { Issuer: IssuerApi }).Issuer;

@Injectable()
export class OidcService {
  private clientPromise: Promise<AuthorizationClient> | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async getAuthorizationUrl(params: { state: string; nonce: string; codeChallenge: string; scopes: string[] }): Promise<string> {
    const client = await this.ensureClient();
    return client.authorizationUrl({
      state: params.state,
      nonce: params.nonce,
      scope: params.scopes.join(' '),
      redirect_uri: this.config.oidcRedirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    });
  }

  async handleCallback(params: { state: string; code: string; nonce: string; codeVerifier: string }): Promise<TokenSetResult> {
    const client = await this.ensureClient();
    const checks = { state: params.state, nonce: params.nonce, code_verifier: params.codeVerifier };
    return client.callback(
      this.config.oidcRedirectUri,
      { code: params.code, state: params.state },
      checks,
    ) as Promise<TokenSetResult>;
  }

  private async ensureClient(): Promise<AuthorizationClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient();
    }
    return this.clientPromise;
  }

  private async createClient(): Promise<AuthorizationClient> {
    const issuer = await issuerApi.discover(this.config.oidcIssuerUrl);
    const metadata: ClientMetadata = {
      client_id: this.config.oidcClientId,
      client_secret: this.config.oidcClientSecret || undefined,
      redirect_uris: [this.config.oidcRedirectUri],
      response_types: ['code'],
      token_endpoint_auth_method: this.config.oidcClientSecret ? 'client_secret_basic' : 'none',
    };
    return new issuer.Client(metadata);
  }
}
