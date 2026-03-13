import { http } from '@/api/http';
import { isRecord, readNumber, readOptionalString, readString } from '@/api/parsing';

export type SecretProviderType = 'vault';

export type VaultSecretProviderConfig = {
  address: string;
  token: string;
};

export type SecretProviderConfig = {
  vault?: VaultSecretProviderConfig;
};

export interface SecretProvider {
  id: string;
  createdAt: string;
  updatedAt?: string;
  title?: string;
  description?: string;
  type: SecretProviderType;
  config: SecretProviderConfig;
}

export interface SecretProviderCreateRequest {
  title?: string;
  description?: string;
  type: SecretProviderType;
  config: SecretProviderConfig;
}

export interface SecretProviderUpdateRequest {
  title?: string;
  description?: string;
  config?: SecretProviderConfig;
}

export interface PaginatedSecretProviders {
  items: SecretProvider[];
  page: number;
  perPage: number;
  total: number;
}

const SECRET_PROVIDERS_ENDPOINT = '/apiv2/secrets/v1/secret-providers';

function readSecretProviderType(value: unknown): SecretProviderType {
  if (value === 'vault') {
    return 'vault';
  }
  throw new Error('Invalid secret provider type');
}

function parseVaultConfig(value: unknown): VaultSecretProviderConfig | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error('Invalid vault config');
  }
  return {
    address: readString(value.address, 'vault.address'),
    token: readString(value.token, 'vault.token'),
  };
}

function parseSecretProviderConfig(value: unknown): SecretProviderConfig {
  if (!isRecord(value)) {
    throw new Error('Invalid config');
  }
  const vault = parseVaultConfig(value.vault);
  return vault ? { vault } : {};
}

function parseSecretProvider(value: unknown): SecretProvider {
  if (!isRecord(value)) {
    throw new Error('Invalid secret provider');
  }
  return {
    id: readString(value.id, 'secretProvider.id'),
    createdAt: readString(value.createdAt, 'secretProvider.createdAt'),
    updatedAt: readOptionalString(value.updatedAt),
    title: readOptionalString(value.title),
    description: readOptionalString(value.description),
    type: readSecretProviderType(value.type),
    config: parseSecretProviderConfig(value.config),
  };
}

function parseSecretProviderList(value: unknown): PaginatedSecretProviders {
  if (!isRecord(value)) {
    throw new Error('Invalid secret providers response');
  }
  if (!Array.isArray(value.items)) {
    throw new Error('Invalid secret providers items');
  }
  return {
    items: value.items.map(parseSecretProvider),
    page: readNumber(value.page, 'secretProviders.page'),
    perPage: readNumber(value.perPage, 'secretProviders.perPage'),
    total: readNumber(value.total, 'secretProviders.total'),
  };
}

function buildListUrl(params?: { page?: number; perPage?: number }): string {
  const searchParams = new URLSearchParams();
  if (typeof params?.page === 'number' && Number.isFinite(params.page)) {
    searchParams.set('page', String(params.page));
  }
  if (typeof params?.perPage === 'number' && Number.isFinite(params.perPage)) {
    searchParams.set('perPage', String(params.perPage));
  }
  const query = searchParams.toString();
  return query ? `${SECRET_PROVIDERS_ENDPOINT}?${query}` : SECRET_PROVIDERS_ENDPOINT;
}

export async function listSecretProviders(params?: { page?: number; perPage?: number }): Promise<PaginatedSecretProviders> {
  const res = await http.get<unknown>(buildListUrl(params));
  return parseSecretProviderList(res);
}

export async function getSecretProvider(id: string): Promise<SecretProvider> {
  const res = await http.get<unknown>(`${SECRET_PROVIDERS_ENDPOINT}/${encodeURIComponent(id)}`);
  return parseSecretProvider(res);
}

export async function createSecretProvider(payload: SecretProviderCreateRequest): Promise<SecretProvider> {
  const res = await http.post<unknown>(SECRET_PROVIDERS_ENDPOINT, payload);
  return parseSecretProvider(res);
}

export async function updateSecretProvider(id: string, payload: SecretProviderUpdateRequest): Promise<SecretProvider> {
  const res = await http.patch<unknown>(`${SECRET_PROVIDERS_ENDPOINT}/${encodeURIComponent(id)}`, payload);
  return parseSecretProvider(res);
}

export async function deleteSecretProvider(id: string): Promise<void> {
  await http.delete(`${SECRET_PROVIDERS_ENDPOINT}/${encodeURIComponent(id)}`);
}
