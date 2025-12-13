import { Logger } from '@nestjs/common';
import { setTimeout as delay } from 'timers/promises';
import { URL } from 'url';
import { z } from 'zod';

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | undefined>;
  timeoutMs?: number;
  allowStatuses?: number[];
}

interface RawResponse {
  status: number;
  json?: unknown;
  text?: string;
}

export interface LiteLLMAdminClientOptions {
  logger?: Logger;
  maxAttempts: number;
  baseDelayMs: number;
  fetchImpl?: typeof fetch;
}

const teamInfoSchema = z.object({
  team_id: z.string().min(1),
  team_alias: z.string().min(1).optional(),
});

const teamWrapperSchema = z.object({ team: teamInfoSchema }).transform((value) => value.team);

const keyResponseSchema = z.object({ key: z.string().min(1), id: z.string().optional(), team_id: z.string().optional() });

export interface TeamInfo {
  id: string;
  alias?: string;
}

export interface GeneratedKey {
  key: string;
  id?: string;
  teamId?: string;
}

export class LiteLLMAdminClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: Logger;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(private readonly masterKey: string, baseUrl: string, options: LiteLLMAdminClientOptions) {
    const normalized = baseUrl.replace(/\/+$/, '');
    const withoutV1 = normalized.endsWith('/v1') ? normalized.slice(0, -3) : normalized;
    const sanitized = withoutV1.replace(/\/+$/, '');
    this.base = sanitized.length > 0 ? `${sanitized}/` : '/';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.logger = options.logger;
    this.maxAttempts = Math.max(1, options.maxAttempts);
    this.baseDelayMs = Math.max(1, options.baseDelayMs);
  }

  async validateKey(key: string, timeoutMs: number): Promise<boolean> {
    const response = await this.request('GET', 'key/info', {
      query: { key },
      timeoutMs,
      allowStatuses: [400, 401, 404],
    });
    return response.status === 200;
  }

  async deleteByAlias(alias: string): Promise<void> {
    await this.request('POST', 'key/delete', {
      body: { key_aliases: [alias] },
      allowStatuses: [404],
    });
  }

  async deleteKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.request('POST', 'key/delete', {
      body: { keys },
      allowStatuses: [404],
    });
  }

  async fetchTeamById(teamId: string): Promise<TeamInfo | undefined> {
    const response = await this.request('GET', 'team/info', {
      query: { team_id: teamId },
      allowStatuses: [404],
    });
    if (response.status === 404) return undefined;
    return this.parseTeam(response);
  }

  async fetchTeamByAlias(alias: string): Promise<TeamInfo | undefined> {
    const response = await this.request('GET', 'team/info', {
      query: { team_alias: alias },
      allowStatuses: [404],
    });
    if (response.status === 404) return undefined;
    return this.parseTeam(response);
  }

  async createTeam(alias: string): Promise<TeamInfo> {
    const response = await this.request('POST', 'team/new', {
      body: { team_alias: alias },
      allowStatuses: [409],
    });
    if (response.status === 409) {
      const existing = await this.fetchTeamByAlias(alias);
      if (existing) return existing;
      throw new Error('litellm_team_exists_but_unreadable');
    }
    return this.parseTeam(response);
  }

  async generateKey(params: {
    alias: string;
    teamId?: string;
    models: string[];
    duration?: string;
  }): Promise<GeneratedKey> {
    const body: Record<string, unknown> = {
      key_alias: params.alias,
      models: params.models,
    };
    if (typeof params.teamId === 'string') {
      const trimmed = params.teamId.trim();
      if (trimmed.length > 0) body.team_id = trimmed;
    }
    if (typeof params.duration === 'string') {
      const trimmed = params.duration.trim();
      if (trimmed.length > 0) body.duration = trimmed;
    }
    const response = await this.request('POST', 'key/generate', { body });
    const parsed = keyResponseSchema.parse(response.json);
    return { key: parsed.key, id: parsed.id, teamId: parsed.team_id };
  }

  private async request(method: string, path: string, options: RequestOptions = {}): Promise<RawResponse> {
    const { body, query, timeoutMs, allowStatuses = [] } = options;
    const url = new URL(path, this.base);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.masterKey}`,
    };
    const sanitizedBody = body !== undefined && method !== 'GET' ? this.sanitizePayload(body) : undefined;
    const payload = sanitizedBody !== undefined ? JSON.stringify(sanitizedBody) : undefined;
    if (payload) {
      const debugPayload = sanitizedBody ?? body;
      const environment = process.env.NODE_ENV ?? 'undefined';
      if (environment !== 'production') {
        if (this.logger?.debug) {
          this.logger.debug(`LiteLLM admin payload ${method} ${path}`, { body: debugPayload });
        }
        console.debug('[LiteLLM admin]', { method, path, body: debugPayload, env: environment });
      } else {
        console.debug('[LiteLLM admin skipped logging in production]', { method, path });
      }
    }
    if (payload) headers['content-type'] = 'application/json';

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const controller = timeoutMs ? new AbortController() : undefined;
      const timer = timeoutMs
        ? setTimeout(() => {
            controller?.abort();
          }, timeoutMs)
        : undefined;
      try {
        const response = await this.fetchImpl(url.toString(), {
          method,
          headers,
          body: payload,
          signal: controller?.signal,
        });
        if (timer) clearTimeout(timer);
        if (response.ok || allowStatuses.includes(response.status)) {
          const raw = await this.toRawResponse(response);
          return raw;
        }

        const errorText = await this.safeText(response);
        if (response.status >= 500 && attempt < this.maxAttempts) {
          this.logger?.warn(
            `LiteLLM admin request failed (retrying) ${JSON.stringify({ method, path, status: response.status, attempt })}`,
          );
          await this.backoff(attempt);
          continue;
        }
        throw new LiteLLMAdminHttpError(method, url.toString(), response.status, errorText);
      } catch (error) {
        if (timer) clearTimeout(timer);
        lastError = error;
        if (error instanceof LiteLLMAdminHttpError) throw error;
        const abortError = this.isAbortError(error);
        if (attempt >= this.maxAttempts && abortError) {
          throw new LiteLLMAdminTimeoutError(method, url.toString(), timeoutMs ?? 0, error);
        }
        if (attempt >= this.maxAttempts) {
          throw error;
        }
        this.logger?.warn(
          `LiteLLM admin request error (retrying) ${JSON.stringify({ method, path, attempt, error: this.toErrorMessage(error) })}`,
        );
        await this.backoff(attempt);
      }
    }
    throw lastError instanceof Error ? lastError : new Error('litellm_admin_request_failed');
  }

  private async toRawResponse(response: Response): Promise<RawResponse> {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return { status: response.status, json: await response.json() };
      } catch {
        return { status: response.status };
      }
    }
    return { status: response.status, text: await this.safeText(response) };
  }

  private async safeText(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return '';
    }
  }

  private async backoff(attempt: number): Promise<void> {
    const delayMs = this.baseDelayMs * Math.pow(2, attempt - 1);
    await delay(delayMs);
  }

  private sanitizePayload(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value
        .map((entry) => this.sanitizePayload(entry))
        .filter((entry) => entry !== undefined && entry !== null);
    }

    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
        (acc, [key, entryValue]) => {
          if (entryValue === null || entryValue === undefined) return acc;
          acc[key] = this.sanitizePayload(entryValue);
          return acc;
        },
        {},
      );
      return entries;
    }

    return value;
  }

  private parseTeam(response: RawResponse): TeamInfo {
    const payload = response.json;
    const direct = teamInfoSchema.safeParse(payload);
    if (direct.success) {
      return { id: direct.data.team_id, alias: direct.data.team_alias };
    }
    const wrapped = teamWrapperSchema.safeParse(payload);
    if (wrapped.success) {
      return { id: wrapped.data.team_id, alias: wrapped.data.team_alias };
    }
    throw new Error('litellm_invalid_team_response');
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return JSON.stringify(error);
  }
}

export class LiteLLMAdminHttpError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`LiteLLM admin HTTP error ${status}`);
  }
}

export class LiteLLMAdminTimeoutError extends Error {
  constructor(
    readonly method: string,
    readonly url: string,
    readonly timeoutMs: number,
    readonly cause: unknown,
  ) {
    super(`LiteLLM admin request timed out after ${timeoutMs}ms`);
  }
}
