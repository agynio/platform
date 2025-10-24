// Helper to auto-provision a LiteLLM virtual key at startup.
// Exports:
// - maybeProvisionLiteLLMKey(cfg, logger): resolves to { apiKey?, baseUrl? } or {}
// - configureOpenAIEnvFromLiteLLM(cfg, logger): calls maybeProvisionLiteLLMKey and sets process.env vars

import type { ConfigService } from './config.service';
import type { LoggerService } from './logger.service';

export type ProvisionResult = { apiKey?: string; baseUrl?: string };

const toList = (v: string | undefined, dflt: string[]): string[] =>
  (v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean).length
    ? (v as string)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : dflt;

export async function maybeProvisionLiteLLMKey(cfg: ConfigService, logger: LoggerService): Promise<ProvisionResult> {
  // Backward-compatible: if OPENAI_API_KEY is already provided, do nothing.
  if (cfg.openaiApiKey) return {};

  const base = cfg.litellmBaseUrl;
  const master = cfg.litellmMasterKey;
  if (!base || !master) return {};

  const models = toList(process.env.LITELLM_MODELS, ['all-team-models']);
  const duration = process.env.LITELLM_KEY_DURATION || '30d';
  const keyAlias = process.env.LITELLM_KEY_ALIAS || `agents-${process.pid}`;
  const maxBudget = process.env.LITELLM_MAX_BUDGET;
  const rpm = process.env.LITELLM_RPM_LIMIT;
  const tpm = process.env.LITELLM_TPM_LIMIT;
  const teamId = process.env.LITELLM_TEAM_ID;

  const url = `${base.replace(/\/$/, '')}/key/generate`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    authorization: `Bearer ${master}`,
  };

  const body: Record<string, unknown> = {
    models,
    duration,
    key_alias: keyAlias,
  };
  if (typeof maxBudget === 'string' && maxBudget.length > 0) {
    const n = Number(maxBudget);
    if (Number.isFinite(n) && n >= 0) body.max_budget = n;
  }
  if (typeof rpm === 'string' && rpm.length > 0) {
    const n = Number(rpm);
    if (Number.isFinite(n) && n >= 0) body.rpm_limit = n;
  }
  if (typeof tpm === 'string' && tpm.length > 0) {
    const n = Number(tpm);
    if (Number.isFinite(n) && n >= 0) body.tpm_limit = n;
  }
  if (typeof teamId === 'string' && teamId.length > 0) body.team_id = teamId;

  let resp: Response;
  try {
    resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e: unknown) {
    logger.error('LiteLLM provisioning request failed to send');
    throw new Error('litellm_provision_request_failed');
  }

  if (!resp.ok) {
    const status = resp.status;
    const text = await safeReadText(resp);
    // Log non-sensitive details only
    logger.error('LiteLLM provisioning failed: status=%s, body=%s', String(status), redact(text));
    throw new Error(`litellm_provision_failed_${status}`);
  }

  const data = (await safeReadJson(resp)) as { key?: string } | undefined;
  const key = data?.key;
  if (!key || typeof key !== 'string') {
    logger.error('LiteLLM provisioning returned no key');
    throw new Error('litellm_provision_invalid_response');
  }

  const baseUrl = process.env.OPENAI_BASE_URL || `${base.replace(/\/$/, '')}/v1`;
  return { apiKey: key, baseUrl };
}

// Optional convenience for testing startup behavior without importing server index.
export async function configureOpenAIEnvFromLiteLLM(cfg: ConfigService, logger: LoggerService): Promise<ProvisionResult> {
  const res = await maybeProvisionLiteLLMKey(cfg, logger);
  if (res.apiKey && !process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = res.apiKey;
  if (res.baseUrl && !process.env.OPENAI_BASE_URL) process.env.OPENAI_BASE_URL = res.baseUrl;
  if (res.apiKey) logger.info('OPENAI_API_KEY set via LiteLLM auto-provisioning');
  if (res.baseUrl) logger.info(`OPENAI_BASE_URL resolved to ${res.baseUrl}`);
  return res;
}

async function safeReadText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}

async function safeReadJson(resp: Response): Promise<unknown> {
  try {
    return await resp.json();
  } catch {
    return undefined;
  }
}

function redact(s: string): string {
  if (!s) return s;
  // Remove anything that looks like a key or token
  return s.replace(/(sk-[A-Za-z0-9_\-]{6,})/g, '[REDACTED]');
}

