import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ResolveOptions, ResolveResult, Providers } from './references';
import { resolveReferences, ResolveError } from './references';
import { VaultService } from '../vault/vault.service';
import { GraphVariablesService } from '../graph/services/graphVariables.service';

@Injectable()
export class ReferenceResolverService {
  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly vaultService?: VaultService,
  ) {}

  private getVariablesService(): GraphVariablesService | undefined {
    try {
      return this.moduleRef.get(GraphVariablesService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private buildProviders(graphName: string | undefined, overrides: Partial<Providers> | undefined, basePath?: string): Providers {
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
      const variablesService = this.getVariablesService();
      if (!variablesService) {
        throw new ResolveError('provider_missing', 'GraphVariablesService unavailable', {
          path: basePath ?? '/variable',
          source: 'variable',
        });
      }
      return variablesService.resolveValue(graphName ?? 'main', ref.name);
    };
    return {
      secret,
      variable,
      ...overrides,
    } satisfies Providers;
  }

  async resolve<T>(
    input: T,
    opts?: ResolveOptions & { graphName?: string; providers?: Partial<Providers> },
  ): Promise<ResolveResult<T>> {
    const { graphName, providers: overrides, ...options } = opts || {};
    const providers = this.buildProviders(graphName, overrides, options.basePath);
    return resolveReferences(input, providers, options);
  }
}
