import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { LiteLLMKeyStore, PersistedLiteLLMKey } from '../../src/llm/provisioners/litellm.key.store';
import { LiteLLMProvisioner } from '../../src/llm/provisioners/litellm.provisioner';
import { LLMSettingsService } from '../../src/settings/llm/llmSettings.service';
import { clearTestConfig, registerTestConfig } from '../helpers/config';
import { waitForLiteLLM } from '../helpers/litellm';

const shouldRun = process.env.LITELLM_INTEGRATION === '1';
const describeLiteLLM = shouldRun ? describe : describe.skip;

const baseUrl = process.env.LITELLM_INTEGRATION_BASE_URL ?? 'http://127.0.0.1:4500';
const masterKey = process.env.LITELLM_INTEGRATION_MASTER_KEY ?? 'sk-litellm-integration-master';

const REFRESH_TIMEOUT_MS = 120_000;

class InMemoryKeyStore implements LiteLLMKeyStore {
  public current?: PersistedLiteLLMKey;

  async load(alias: string): Promise<PersistedLiteLLMKey | null> {
    if (!this.current) return null;
    if (this.current.alias !== alias) return null;
    return this.current;
  }

  async save(key: PersistedLiteLLMKey): Promise<void> {
    this.current = key;
  }
}

type KeyInfo = {
  key_alias?: string;
  models?: string[];
  expires?: string;
};

describeLiteLLM('LiteLLM provisioner integration', () => {
  beforeAll(async () => {
    clearTestConfig();
    const config = registerTestConfig({
      litellmBaseUrl: baseUrl,
      litellmMasterKey: masterKey,
    });
    const service = new LLMSettingsService(config);
    await waitForLiteLLM(service, 120_000);
    clearTestConfig();
  }, 120_000);

  beforeEach(() => {
    clearTestConfig();
  });

  afterEach(() => {
    clearTestConfig();
  });

  afterAll(() => {
    clearTestConfig();
  });

  it('provisions a virtual key on startup', async () => {
    const alias = buildAlias('startup');
    const store = new InMemoryKeyStore();
    const config = registerTestConfig({
      litellmBaseUrl: baseUrl,
      litellmMasterKey: masterKey,
      litellmKeyAlias: alias,
    });
    const provisioner = new LiteLLMProvisioner(config, store);
    let key: string | undefined;
    try {
      await provisioner.init();
      key = store.current?.key;
      expect(store.current?.alias).toBe(alias);
      expect(key).toBeTruthy();
    } finally {
      await provisioner.teardown();
      if (key) {
        await deleteKey(key);
      }
    }
  }, 60_000);

  it('recovers when an alias already exists', async () => {
    const alias = buildAlias('alias');
    const initialStore = new InMemoryKeyStore();
    const initialConfig = registerTestConfig({
      litellmBaseUrl: baseUrl,
      litellmMasterKey: masterKey,
      litellmKeyAlias: alias,
    });
    const initialProvisioner = new LiteLLMProvisioner(initialConfig, initialStore);
    let firstKey: string | undefined;
    let secondKey: string | undefined;
    try {
      await initialProvisioner.init();
      firstKey = initialStore.current?.key;
      await initialProvisioner.teardown();

      clearTestConfig();
      const nextStore = new InMemoryKeyStore();
      const nextConfig = registerTestConfig({
        litellmBaseUrl: baseUrl,
        litellmMasterKey: masterKey,
        litellmKeyAlias: alias,
      });
      const nextProvisioner = new LiteLLMProvisioner(nextConfig, nextStore);
      try {
        await nextProvisioner.init();
        secondKey = nextStore.current?.key;
        expect(secondKey).toBeTruthy();
        if (firstKey && secondKey) {
          expect(secondKey).not.toBe(firstKey);
        }
      } finally {
        await nextProvisioner.teardown();
      }
    } finally {
      if (secondKey) {
        await deleteKey(secondKey);
      }
      if (firstKey) {
        await deleteKey(firstKey);
      }
    }
  }, 60_000);

  it('refreshes the virtual key before expiry', async () => {
    const alias = buildAlias('refresh');
    const store = new InMemoryKeyStore();
    const config = registerTestConfig({
      litellmBaseUrl: baseUrl,
      litellmMasterKey: masterKey,
      litellmKeyAlias: alias,
      litellmKeyDuration: '6m',
    });
    const provisioner = new LiteLLMProvisioner(config, store);
    let firstKey: string | undefined;
    let rotatedKey: string | undefined;
    try {
      await provisioner.init();
      firstKey = store.current?.key;
      expect(firstKey).toBeTruthy();

      rotatedKey = await waitForKeyRotation(store, firstKey as string, REFRESH_TIMEOUT_MS);
      expect(rotatedKey).not.toBe(firstKey);
    } finally {
      await provisioner.teardown();
      if (rotatedKey) {
        await deleteKey(rotatedKey);
      }
      if (firstKey) {
        await deleteKey(firstKey);
      }
    }
  }, REFRESH_TIMEOUT_MS + 30_000);

  it('passes alias, models, and duration to LiteLLM', async () => {
    const alias = buildAlias('config');
    const models = ['gpt-4o-mini', 'gpt-4o'];
    const store = new InMemoryKeyStore();
    const config = registerTestConfig({
      litellmBaseUrl: baseUrl,
      litellmMasterKey: masterKey,
      litellmKeyAlias: alias,
      litellmKeyDuration: '1m',
      litellmModels: models,
    });
    const provisioner = new LiteLLMProvisioner(config, store);
    let key: string | undefined;
    try {
      await provisioner.init();
      key = store.current?.key;
      expect(key).toBeTruthy();

      const info = await fetchKeyInfo(key as string);
      expect(info?.key_alias).toBe(alias);
      expect(info?.models).toEqual(models);

      const expiresAt = info?.expires ? Date.parse(info.expires) : NaN;
      expect(Number.isNaN(expiresAt)).toBe(false);
      const remainingMs = expiresAt - Date.now();
      expect(remainingMs).toBeLessThanOrEqual(120_000);
      expect(remainingMs).toBeGreaterThan(-30_000);
    } finally {
      await provisioner.teardown();
      if (key) {
        await deleteKey(key);
      }
    }
  }, 60_000);
});

function buildAlias(prefix: string): string {
  return `agents/integration/${prefix}-${Date.now()}-${Math.round(Math.random() * 10_000)}`;
}

async function fetchKeyInfo(key: string): Promise<KeyInfo | null> {
  const url = `${baseUrl}/key/info?key=${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${masterKey}`,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to fetch key info: ${response.status} ${body}`);
  }
  const data = (await response.json()) as { info?: KeyInfo };
  return data.info ?? null;
}

async function deleteKey(key: string): Promise<void> {
  const response = await fetch(`${baseUrl}/key/delete`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${masterKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ keys: [key] }),
  });
  if (response.ok || response.status === 404) {
    return;
  }
  const body = await response.text();
  throw new Error(`Failed to delete key: ${response.status} ${body}`);
}

async function waitForKeyRotation(
  store: InMemoryKeyStore,
  initialKey: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const currentKey = store.current?.key;
    if (currentKey && currentKey !== initialKey) {
      return currentKey;
    }
    await delay(2_000);
  }
  throw new Error('LiteLLM key refresh did not occur within the timeout');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
