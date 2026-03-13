import { http } from '@/api/http';

export interface EntitySecret {
  id: string;
  createdAt: string;
  updatedAt?: string;
  title?: string;
  description?: string;
  secretProviderId: string;
  remoteName: string;
}

export interface SecretCreateRequest {
  title?: string;
  description?: string;
  secretProviderId: string;
  remoteName: string;
}

export interface SecretUpdateRequest {
  title?: string;
  description?: string;
  secretProviderId?: string;
  remoteName?: string;
}

export interface PaginatedSecrets {
  items: EntitySecret[];
  page: number;
  perPage: number;
  total: number;
}

export interface ResolvedSecretValue {
  value: string;
}

const ENTITY_SECRETS_ENDPOINT = '/apiv2/secrets/v1/secrets';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function parseEntitySecret(value: unknown): EntitySecret {
  if (!isRecord(value)) {
    throw new Error('Invalid secret');
  }
  return {
    id: readString(value.id, 'secret.id'),
    createdAt: readString(value.createdAt, 'secret.createdAt'),
    updatedAt: readOptionalString(value.updatedAt),
    title: readOptionalString(value.title),
    description: readOptionalString(value.description),
    secretProviderId: readString(value.secretProviderId, 'secret.secretProviderId'),
    remoteName: readString(value.remoteName, 'secret.remoteName'),
  };
}

function parseSecretList(value: unknown): PaginatedSecrets {
  if (!isRecord(value)) {
    throw new Error('Invalid secrets response');
  }
  if (!Array.isArray(value.items)) {
    throw new Error('Invalid secrets items');
  }
  return {
    items: value.items.map(parseEntitySecret),
    page: readNumber(value.page, 'secrets.page'),
    perPage: readNumber(value.perPage, 'secrets.perPage'),
    total: readNumber(value.total, 'secrets.total'),
  };
}

function parseResolvedSecretValue(value: unknown): ResolvedSecretValue {
  if (!isRecord(value)) {
    throw new Error('Invalid resolved secret response');
  }
  return { value: readString(value.value, 'resolvedSecret.value') };
}

function buildListUrl(params?: { secretProviderId?: string; page?: number; perPage?: number }): string {
  const searchParams = new URLSearchParams();
  if (typeof params?.secretProviderId === 'string' && params.secretProviderId.length > 0) {
    searchParams.set('secretProviderId', params.secretProviderId);
  }
  if (typeof params?.page === 'number' && Number.isFinite(params.page)) {
    searchParams.set('page', String(params.page));
  }
  if (typeof params?.perPage === 'number' && Number.isFinite(params.perPage)) {
    searchParams.set('perPage', String(params.perPage));
  }
  const query = searchParams.toString();
  return query ? `${ENTITY_SECRETS_ENDPOINT}?${query}` : ENTITY_SECRETS_ENDPOINT;
}

export async function listEntitySecrets(params?: { secretProviderId?: string; page?: number; perPage?: number }): Promise<PaginatedSecrets> {
  const res = await http.get<unknown>(buildListUrl(params));
  return parseSecretList(res);
}

export async function getEntitySecret(id: string): Promise<EntitySecret> {
  const res = await http.get<unknown>(`${ENTITY_SECRETS_ENDPOINT}/${encodeURIComponent(id)}`);
  return parseEntitySecret(res);
}

export async function createEntitySecret(payload: SecretCreateRequest): Promise<EntitySecret> {
  const res = await http.post<unknown>(ENTITY_SECRETS_ENDPOINT, payload);
  return parseEntitySecret(res);
}

export async function updateEntitySecret(id: string, payload: SecretUpdateRequest): Promise<EntitySecret> {
  const res = await http.patch<unknown>(`${ENTITY_SECRETS_ENDPOINT}/${encodeURIComponent(id)}`, payload);
  return parseEntitySecret(res);
}

export async function deleteEntitySecret(id: string): Promise<void> {
  await http.delete(`${ENTITY_SECRETS_ENDPOINT}/${encodeURIComponent(id)}`);
}

export async function resolveEntitySecret(id: string): Promise<ResolvedSecretValue> {
  const res = await http.post<unknown>(`${ENTITY_SECRETS_ENDPOINT}/${encodeURIComponent(id)}/resolve`);
  return parseResolvedSecretValue(res);
}
