import type { SecretProvider } from '@/api/modules/secretProviders';

export const PROVIDER_DROPDOWN_PAGE_SIZE = 100;

export function buildProviderLabel(provider: SecretProvider) {
  return provider.title?.trim() || provider.id;
}
