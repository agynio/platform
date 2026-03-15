import { Inject, Injectable } from '@nestjs/common';
import type { ResolveOptions, ResolveResult, Providers } from './references';
import { resolveReferences, ResolveError } from './references';
import { VaultService } from '../vault/vault.service';
import { TEAMS_GRPC_CLIENT } from '../teams/teamsGrpc.token';
import type { TeamsGrpcClient } from '../teams/teamsGrpc.client';

@Injectable()
export class ReferenceResolverService {
  constructor(
    @Inject(VaultService) private readonly vaultService: VaultService,
    @Inject(TEAMS_GRPC_CLIENT) private readonly teamsClient: TeamsGrpcClient,
  ) {}

  private buildProviders(
    overrides: Partial<Providers> | undefined,
    basePath?: string,
  ): Providers {
    const secret = async (ref: { mount?: string | null; path: string; key: string }) => {
      if (!this.vaultService) {
        throw new ResolveError('provider_missing', 'VaultService not available to resolve secret', {
          path: basePath ?? '/secret',
          source: 'secret',
        });
      }
      return this.vaultService.getSecret({ mount: ref.mount ?? 'secret', path: ref.path, key: ref.key });
    };
    const variable = async (ref: { name: string }) => {
      if (!this.teamsClient) {
        throw new ResolveError('provider_missing', 'TeamsGrpcClient unavailable', {
          path: basePath ?? '/variable',
          source: 'variable',
        });
      }
      const response = await this.teamsClient.resolveVariable({ key: ref.name });
      if (!response?.found) return undefined;
      const value = response.value?.trim?.() ?? response.value;
      return value && value.length > 0 ? value : undefined;
    };
    return {
      secret,
      variable,
      ...overrides,
    } satisfies Providers;
  }

  async resolve<T>(
    input: T,
    opts?: ResolveOptions & { providers?: Partial<Providers> },
  ): Promise<ResolveResult<T>> {
    const { providers: overrides, ...options } = opts || {};
    const providers = this.buildProviders(overrides, options.basePath);
    return resolveReferences(input, providers, options);
  }
}
