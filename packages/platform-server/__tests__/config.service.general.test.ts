import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigService, configSchema } from '../src/core/services/config.service';

const requiredLiteLLM = {
  litellmBaseUrl: 'https://litellm.direct',
  litellmMasterKey: 'sk-master',
};

const requiredCommon = {
  agentsDatabaseUrl: 'postgres://user:pass@localhost:5432/db',
};

const restoreEnv = (() => {
  const baseline = { ...process.env };
  return () => {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, baseline);
  };
})();

describe('ConfigService general configuration', () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('exposes typed getters for explicit values', () => {
    const parsed = configSchema.parse({
      ...requiredCommon,
      ...requiredLiteLLM,
      githubAppId: 'app-id',
      githubAppPrivateKey: 'private-key',
      githubInstallationId: 'inst-id',
      githubToken: 'gh-token',
      graphRepoPath: '/custom/graph',
      graphBranch: 'graph-branch',
      graphAuthorName: 'Graph Author',
      graphAuthorEmail: 'graph@author.test',
      graphLockTimeoutMs: 6400,
      vaultEnabled: 'TRUE',
      vaultAddr: 'https://vault.local',
      vaultToken: 'vault-token',
      dockerMirrorUrl: 'http://mirror.local',
      workspaceNetworkName: 'workspace-net',
      nixAllowedChannels: 'channel-a, channel-b',
      nixHttpTimeoutMs: 12000,
      nixCacheTtlMs: 18000,
      nixCacheMax: 1400,
      nixRepoAllowlist: ' repo-one , repo-two ',
      mcpToolsStaleTimeoutMs: 9000,
      ncpsEnabled: true,
      ncpsUrl: 'http://legacy.ncps',
      ncpsUrlServer: 'http://server.ncps',
      ncpsUrlContainer: 'http://container.ncps',
      ncpsPubkeyPath: '/pub/key',
      ncpsFetchTimeoutMs: 4500,
      ncpsRefreshIntervalMs: 30 * 60_000,
      ncpsStartupMaxRetries: 11,
      ncpsRetryBackoffMs: 650,
      ncpsRetryBackoffFactor: 3,
      ncpsAllowStartWithoutKey: false,
      ncpsCaBundle: '/ca/bundle',
      ncpsRotationGraceMinutes: 15,
      ncpsAuthHeader: 'X-Auth',
      ncpsAuthToken: 'ncps-token',
      corsOrigins: 'https://a.example, https://b.example',
    });

    const service = new ConfigService().init(parsed);

    expect(service.githubAppId).toBe('app-id');
    expect(service.githubAppPrivateKey).toBe('private-key');
    expect(service.githubInstallationId).toBe('inst-id');
    expect(service.githubToken).toBe('gh-token');
    expect(service.litellmBaseUrl).toBe('https://litellm.direct');
    expect(service.litellmMasterKey).toBe('sk-master');
    expect(service.graphRepoPath).toBe('/custom/graph');
    expect(service.graphBranch).toBe('graph-branch');
    expect(service.graphAuthorName).toBe('Graph Author');
    expect(service.graphAuthorEmail).toBe('graph@author.test');
    expect(service.graphLockTimeoutMs).toBe(6400);
    expect(service.vaultEnabled).toBe(true);
    expect(service.vaultAddr).toBe('https://vault.local');
    expect(service.vaultToken).toBe('vault-token');
    expect(service.dockerMirrorUrl).toBe('http://mirror.local');
    expect(service.workspaceNetworkName).toBe('workspace-net');
    expect(service.nixAllowedChannels).toEqual(['channel-a', 'channel-b']);
    expect(service.nixHttpTimeoutMs).toBe(12000);
    expect(service.nixCacheTtlMs).toBe(18000);
    expect(service.nixCacheMax).toBe(1400);
    expect(service.nixRepoAllowlist).toEqual(['repo-one', 'repo-two']);
    expect(service.mcpToolsStaleTimeoutMs).toBe(9000);
    expect(service.ncpsEnabled).toBe(true);
    expect(service.ncpsUrl).toBe('http://container.ncps');
    expect(service.ncpsUrlServer).toBe('http://server.ncps');
    expect(service.ncpsUrlContainer).toBe('http://container.ncps');
    expect(service.ncpsPubkeyPath).toBe('/pub/key');
    expect(service.ncpsFetchTimeoutMs).toBe(4500);
    expect(service.ncpsRefreshIntervalMs).toBe(30 * 60_000);
    expect(service.ncpsStartupMaxRetries).toBe(11);
    expect(service.ncpsRetryBackoffMs).toBe(650);
    expect(service.ncpsRetryBackoffFactor).toBe(3);
    expect(service.ncpsAllowStartWithoutKey).toBe(false);
    expect(service.ncpsCaBundle).toBe('/ca/bundle');
    expect(service.ncpsRotationGraceMinutes).toBe(15);
    expect(service.ncpsAuthHeader).toBe('X-Auth');
    expect(service.ncpsAuthToken).toBe('ncps-token');
    expect(service.agentsDatabaseUrl).toBe(requiredCommon.agentsDatabaseUrl);
    expect(service.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('applies defaults and coercions when values are missing or invalid', () => {
    const parsed = configSchema.parse({
      ...requiredCommon,
      ...requiredLiteLLM,
      graphLockTimeoutMs: 'not-a-number',
      vaultEnabled: 'nope',
      dockerMirrorUrl: undefined,
      workspaceNetworkName: undefined,
      nixAllowedChannels: undefined,
      nixHttpTimeoutMs: 'NaN',
      nixCacheTtlMs: 'invalid',
      nixCacheMax: 'oops',
      nixRepoAllowlist: ' first , , second , ',
      mcpToolsStaleTimeoutMs: 'NaN',
      ncpsEnabled: undefined,
      ncpsUrl: undefined,
      ncpsUrlServer: undefined,
      ncpsUrlContainer: undefined,
      ncpsPubkeyPath: undefined,
      ncpsFetchTimeoutMs: 'NaN',
      ncpsRefreshIntervalMs: 'not-a-number',
      ncpsStartupMaxRetries: 'bad',
      ncpsRetryBackoffMs: 'NaN',
      ncpsRetryBackoffFactor: 'bad',
      ncpsAllowStartWithoutKey: undefined,
      ncpsCaBundle: undefined,
      ncpsRotationGraceMinutes: 'NaN',
      ncpsAuthHeader: undefined,
      ncpsAuthToken: undefined,
      corsOrigins: undefined,
    });

    const service = new ConfigService().init(parsed);

    expect(service.graphLockTimeoutMs).toBe(5000);
    expect(service.vaultEnabled).toBe(false);
    expect(service.dockerMirrorUrl).toBe('http://registry-mirror:5000');
    expect(service.workspaceNetworkName).toBe('agents_net');
    expect(service.nixAllowedChannels).toEqual(['nixpkgs-unstable', 'nixos-24.11']);
    expect(service.nixHttpTimeoutMs).toBe(5000);
    expect(service.nixCacheTtlMs).toBe(5 * 60_000);
    expect(service.nixCacheMax).toBe(500);
    expect(service.nixRepoAllowlist).toEqual(['first', 'second']);
    expect(service.mcpToolsStaleTimeoutMs).toBe(0);
    expect(service.ncpsEnabled).toBe(false);
    expect(service.ncpsUrl).toBe('http://ncps:8501');
    expect(service.ncpsUrlServer).toBe('http://ncps:8501');
    expect(service.ncpsUrlContainer).toBe('http://ncps:8501');
    expect(service.ncpsPubkeyPath).toBe('/pubkey');
    expect(service.ncpsFetchTimeoutMs).toBe(3000);
    expect(service.ncpsRefreshIntervalMs).toBe(10 * 60_000);
    expect(service.ncpsStartupMaxRetries).toBe(8);
    expect(service.ncpsRetryBackoffMs).toBe(500);
    expect(service.ncpsRetryBackoffFactor).toBe(2);
    expect(service.ncpsAllowStartWithoutKey).toBe(true);
    expect(service.ncpsCaBundle).toBeUndefined();
    expect(service.ncpsRotationGraceMinutes).toBe(0);
    expect(service.ncpsAuthHeader).toBeUndefined();
    expect(service.ncpsAuthToken).toBeUndefined();
    expect(service.corsOrigins).toEqual([]);
  });

  it('uses legacy NCPS_URL environment variables when newer keys are absent', () => {
    process.env.LITELLM_BASE_URL = 'https://env.litellm';
    process.env.LITELLM_MASTER_KEY = 'env-master';
    process.env.AGENTS_DATABASE_URL = requiredCommon.agentsDatabaseUrl;
    process.env.NCPS_URL = 'http://legacy.ncps';
    process.env.NCPS_ALLOW_START_WITHOUT_KEY = 'false';
    delete process.env.NCPS_URL_SERVER;
    delete process.env.NCPS_URL_CONTAINER;
    process.env.NIX_ALLOWED_CHANNELS = 'channel-one';
    process.env.GRAPH_LOCK_TIMEOUT_MS = '7000';
    process.env.CORS_ORIGINS = 'https://legacy.example';

    const service = ConfigService.fromEnv();

    expect(service.ncpsUrl).toBe('http://legacy.ncps');
    expect(service.ncpsUrlServer).toBe('http://legacy.ncps');
    expect(service.ncpsUrlContainer).toBe('http://legacy.ncps');
    expect(service.ncpsAllowStartWithoutKey).toBe(false);
    expect(service.nixAllowedChannels).toEqual(['channel-one']);
    expect(service.graphLockTimeoutMs).toBe(7000);
    expect(service.corsOrigins).toEqual(['https://legacy.example']);
  });

  it('throws when LiteLLM credentials are missing outside of test environments', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_MASTER_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;

    const result = configSchema.safeParse({
      ...requiredCommon,
      litellmBaseUrl: undefined,
      litellmMasterKey: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('LITELLM_BASE_URL is required');
      expect(messages).toContain('LITELLM_MASTER_KEY is required');
    }

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('falls back to test defaults when sanitized LiteLLM values are blank', () => {
    const parsed = configSchema.parse({
      ...requiredCommon,
      litellmBaseUrl: ' /// ',
      litellmMasterKey: '   ',
    });

    expect(parsed.litellmBaseUrl).toBe('http://litellm.local');
    expect(parsed.litellmMasterKey).toBe('test-master-key');
  });
});
