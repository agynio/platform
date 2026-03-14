import { http } from '@/api/http';
import { isRecord, readOptionalString, readString } from '@/api/parsing';

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
  nextPageToken?: string;
}

export interface ResolvedSecretValue {
  value: string;
}

const ENTITY_SECRETS_ENDPOINT = '/apiv2/secrets/v1/secrets';

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
    nextPageToken: readOptionalString(value.nextPageToken),
  };
}

function parseResolvedSecretValue(value: unknown): ResolvedSecretValue {
  if (!isRecord(value)) {
    throw new Error('Invalid resolved secret response');
  }
  return { value: readString(value.value, 'resolvedSecret.value') };
}

function buildListUrl(params?: { secretProviderId?: string; pageSize?: number; pageToken?: string }): string {
  const searchParams = new URLSearchParams();
  if (typeof params?.secretProviderId === 'string' && params.secretProviderId.length > 0) {
    searchParams.set('secretProviderId', params.secretProviderId);
  }
  if (typeof params?.pageSize === 'number' && Number.isFinite(params.pageSize)) {
    searchParams.set('pageSize', String(params.pageSize));
  }
  if (typeof params?.pageToken === 'string' && params.pageToken.length > 0) {
    searchParams.set('pageToken', params.pageToken);
  }
  const query = searchParams.toString();
  return query ? `${ENTITY_SECRETS_ENDPOINT}?${query}` : ENTITY_SECRETS_ENDPOINT;
}

export async function listEntitySecrets(params?: {
  secretProviderId?: string;
  pageSize?: number;
  pageToken?: string;
}): Promise<PaginatedSecrets> {
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
