import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();

export const configSchema = z.object({
  // LiteLLM admin configuration (required)
  litellmBaseUrl: z
    .string()
    .min(1, 'LITELLM_BASE_URL is required')
    .transform((value) => value.trim())
    .refine((value) => !value.match(/\/v1\/?$/), 'LITELLM_BASE_URL must be the LiteLLM root without /v1')
    .transform((value) => value.replace(/\/+$/, '')),
  litellmMasterKey: z
    .string()
    .min(1, 'LITELLM_MASTER_KEY is required')
    .transform((value) => value.trim()),
  // Optional GitHub credentials (App or PAT)
  githubAppId: z.string().optional(),
  githubAppPrivateKey: z.string().optional(),
  githubInstallationId: z.string().optional(),
  githubToken: z.string().optional(),
  // Graph persistence
  graphRepoPath: z.string().default('./data/graph'),
  graphBranch: z.string().default('graph-state'),
  graphAuthorName: z.string().optional(),
  graphAuthorEmail: z.string().optional(),
  graphLockTimeoutMs: z
    .union([z.string(), z.number()])
    .default('5000')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 5000;
    }),
  // Optional Vault flags (disabled by default)
  vaultEnabled: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v)),
  vaultAddr: z.string().optional(),
  vaultToken: z.string().optional(),
  // Docker registry mirror URL (used by DinD sidecar)
  dockerMirrorUrl: z.string().min(1).default('http://registry-mirror:5000'),
  // Workspace container network name
  workspaceNetworkName: z.string().min(1).default('agents_net'),
  // Nix search/proxy settings
  nixAllowedChannels: z
    .string()
    .default('nixpkgs-unstable,nixos-24.11')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter((x) => !!x),
    ),
  nixHttpTimeoutMs: z
    .union([z.string(), z.number()])
    .default('5000')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 5000;
    }),
  nixCacheTtlMs: z
    .union([z.string(), z.number()])
    .default(String(5 * 60_000))
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 5 * 60_000;
    }),
  nixCacheMax: z
    .union([z.string(), z.number()])
    .default('500')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 500;
    }),
  nixRepoAllowlist: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
    ),
  // Global MCP tools cache staleness timeout (ms). 0 => never stale by time.
  mcpToolsStaleTimeoutMs: z
    .union([z.string(), z.number()])
    .default('0')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    }),
  // NCPS (Nix Cache Proxy Server) settings
  ncpsEnabled: z
    .union([z.boolean(), z.string()])
    .default('false')
    .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v)),
  // Deprecated single URL; prefer ncpsUrlServer and ncpsUrlContainer
  ncpsUrl: z.string().min(1).default('http://ncps:8501'),
  // New dual NCPS URLs with defaults
  ncpsUrlServer: z.string().min(1).default('http://ncps:8501'),
  ncpsUrlContainer: z.string().min(1).default('http://ncps:8501'),
  ncpsPubkeyPath: z.string().default('/pubkey'),
  ncpsFetchTimeoutMs: z
    .union([z.string(), z.number()])
    .default('3000')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 3000;
    }),
  ncpsRefreshIntervalMs: z
    .union([z.string(), z.number()])
    .default(String(10 * 60_000))
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 10 * 60_000;
    }),
  ncpsStartupMaxRetries: z
    .union([z.string(), z.number()])
    .default('8')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 8;
    }),
  ncpsRetryBackoffMs: z
    .union([z.string(), z.number()])
    .default('500')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 500;
    }),
  ncpsRetryBackoffFactor: z
    .union([z.string(), z.number()])
    .default('2')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 2;
    }),
  ncpsAllowStartWithoutKey: z
    .union([z.boolean(), z.string()])
    .default('true')
    .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v)),
  ncpsCaBundle: z.string().optional(),
  ncpsRotationGraceMinutes: z
    .union([z.string(), z.number()])
    .default('0')
    .transform((v) => {
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    }),
  ncpsAuthHeader: z.string().optional(),
  ncpsAuthToken: z.string().optional(),
  agentsDatabaseUrl: z.string().min(1, 'Agents database connection string is required'),
  // CORS origins (comma-separated in env; parsed to string[])
  corsOrigins: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter((x) => !!x),
    ),
});

export type Config = z.infer<typeof configSchema>;

@Injectable()
export class ConfigService implements Config {
  private static sharedInstance?: ConfigService;

  private _params?: Config;

  static register(instance: ConfigService): ConfigService {
    if (!instance.isInitialized()) {
      throw new Error('Cannot register ConfigService before initialization');
    }
    ConfigService.sharedInstance = instance;
    return instance;
  }

  static getInstance(): ConfigService {
    if (!ConfigService.sharedInstance) {
      throw new Error('ConfigService not initialized. Call ConfigService.fromEnv() during bootstrap before resolving ConfigService through DI.');
    }
    return ConfigService.sharedInstance;
  }

  static isRegistered(): boolean {
    return ConfigService.sharedInstance !== undefined;
  }

  static clearInstanceForTest(): void {
    ConfigService.sharedInstance = undefined;
  }

  static assertInitialized(instance: unknown): asserts instance is ConfigService {
    if (!instance || typeof instance !== 'object') {
      throw new Error('ConfigService injected before initialization');
    }
    const typed = instance as ConfigService;
    if (typeof typed.isInitialized !== 'function') {
      throw new Error('ConfigService injected before initialization');
    }
    if (!typed.isInitialized()) {
      throw new Error('ConfigService injected before initialization');
    }
  }

  private get params(): Config {
    if (!this._params) {
      throw new Error('ConfigService not initialized. Call ConfigService.fromEnv() before accessing configuration.');
    }
    return this._params;
  }

  init(params: Config): this {
    this._params = params;
    return this;
  }

  isInitialized(): boolean {
    return this._params !== undefined;
  }

  get litellmBaseUrl(): string {
    return this.params.litellmBaseUrl;
  }
  get litellmMasterKey(): string {
    return this.params.litellmMasterKey;
  }

  get llmProvider(): 'litellm' {
    return 'litellm';
  }

  get githubAppId(): string | undefined {
    return this.params.githubAppId;
  }
  get githubAppPrivateKey(): string | undefined {
    return this.params.githubAppPrivateKey;
  }
  get githubInstallationId(): string | undefined {
    return this.params.githubInstallationId;
  }
  get githubToken(): string | undefined {
    return this.params.githubToken;
  }

  // Graph config accessors
  get graphRepoPath(): string {
    return this.params.graphRepoPath;
  }
  get graphBranch(): string {
    return this.params.graphBranch;
  }
  get graphAuthorName(): string | undefined {
    return this.params.graphAuthorName;
  }
  get graphAuthorEmail(): string | undefined {
    return this.params.graphAuthorEmail;
  }
  get graphLockTimeoutMs(): number {
    return this.params.graphLockTimeoutMs;
  }

  // Vault getters (optional)
  get vaultEnabled(): boolean {
    return !!this.params.vaultEnabled;
  }
  get vaultAddr(): string | undefined {
    return this.params.vaultAddr;
  }
  get vaultToken(): string | undefined {
    return this.params.vaultToken;
  }

  get dockerMirrorUrl(): string {
    // schema provides default; avoid falsy fallback that breaks zero-value semantics
    return this.params.dockerMirrorUrl;
  }

  get workspaceNetworkName(): string {
    return this.params.workspaceNetworkName;
  }

  // Nix proxy getters
  get nixAllowedChannels(): string[] {
    return this.params.nixAllowedChannels;
  }
  get nixHttpTimeoutMs(): number {
    return this.params.nixHttpTimeoutMs;
  }
  get nixCacheTtlMs(): number {
    return this.params.nixCacheTtlMs;
  }
  get nixCacheMax(): number {
    return this.params.nixCacheMax;
  }

  // MCP tools cache staleness timeout (global default)
  get mcpToolsStaleTimeoutMs(): number {
    return this.params.mcpToolsStaleTimeoutMs ?? 0;
  }

  // NCPS getters
  get ncpsEnabled(): boolean {
    return this.params.ncpsEnabled;
  }
  // Deprecated alias: map to container URL for backward-compatibility
  get ncpsUrl(): string {
    return this.params.ncpsUrlContainer;
  }
  get ncpsUrlServer(): string {
    return this.params.ncpsUrlServer;
  }
  get ncpsUrlContainer(): string {
    return this.params.ncpsUrlContainer;
  }
  get ncpsPubkeyPath(): string {
    return this.params.ncpsPubkeyPath;
  }
  get ncpsFetchTimeoutMs(): number {
    return this.params.ncpsFetchTimeoutMs;
  }
  get ncpsRefreshIntervalMs(): number {
    return this.params.ncpsRefreshIntervalMs;
  }
  get ncpsStartupMaxRetries(): number {
    return this.params.ncpsStartupMaxRetries;
  }
  get ncpsRetryBackoffMs(): number {
    return this.params.ncpsRetryBackoffMs;
  }
  get ncpsRetryBackoffFactor(): number {
    return this.params.ncpsRetryBackoffFactor;
  }
  get ncpsAllowStartWithoutKey(): boolean {
    return this.params.ncpsAllowStartWithoutKey;
  }
  get ncpsCaBundle(): string | undefined {
    return this.params.ncpsCaBundle;
  }
  get ncpsRotationGraceMinutes(): number {
    return this.params.ncpsRotationGraceMinutes;
  }
  get ncpsAuthHeader(): string | undefined {
    return this.params.ncpsAuthHeader;
  }
  get ncpsAuthToken(): string | undefined {
    return this.params.ncpsAuthToken;
  }
  get agentsDatabaseUrl(): string {
    return this.params.agentsDatabaseUrl;
  }
  get corsOrigins(): string[] {
    return this.params.corsOrigins ?? [];
  }
  get nixRepoAllowlist(): string[] {
    return this.params.nixRepoAllowlist ?? [];
  }

  // No global messaging adapter config in Slack-only v1

  static fromEnv(): ConfigService {
    const legacy = process.env.NCPS_URL;
    const urlServer = process.env.NCPS_URL_SERVER || legacy;
    const urlContainer = process.env.NCPS_URL_CONTAINER || legacy;
    const parsed = configSchema.parse({
      litellmBaseUrl: process.env.LITELLM_BASE_URL,
      litellmMasterKey: process.env.LITELLM_MASTER_KEY,
      githubAppId: process.env.GITHUB_APP_ID,
      githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      githubInstallationId: process.env.GITHUB_INSTALLATION_ID,
      githubToken: process.env.GH_TOKEN,
      // Pass raw env; schema will validate/assign default
      graphRepoPath: process.env.GRAPH_REPO_PATH,
      graphBranch: process.env.GRAPH_BRANCH,
      graphAuthorName: process.env.GRAPH_AUTHOR_NAME,
      graphAuthorEmail: process.env.GRAPH_AUTHOR_EMAIL,
      graphLockTimeoutMs: process.env.GRAPH_LOCK_TIMEOUT_MS,
      vaultEnabled: process.env.VAULT_ENABLED,
      vaultAddr: process.env.VAULT_ADDR,
      vaultToken: process.env.VAULT_TOKEN,
      dockerMirrorUrl: process.env.DOCKER_MIRROR_URL,
      workspaceNetworkName: process.env.WORKSPACE_NETWORK_NAME,
      nixAllowedChannels: process.env.NIX_ALLOWED_CHANNELS,
      nixHttpTimeoutMs: process.env.NIX_HTTP_TIMEOUT_MS,
      nixCacheTtlMs: process.env.NIX_CACHE_TTL_MS,
      nixCacheMax: process.env.NIX_CACHE_MAX,
      nixRepoAllowlist: process.env.NIX_REPO_ALLOWLIST,
      mcpToolsStaleTimeoutMs: process.env.MCP_TOOLS_STALE_TIMEOUT_MS,
      ncpsEnabled: process.env.NCPS_ENABLED,
      // Preserve legacy for backward compatibility; prefer dual URLs above
      ncpsUrl: legacy,
      ncpsUrlServer: urlServer,
      ncpsUrlContainer: urlContainer,
      ncpsPubkeyPath: process.env.NCPS_PUBKEY_PATH,
      ncpsFetchTimeoutMs: process.env.NCPS_FETCH_TIMEOUT_MS,
      ncpsRefreshIntervalMs: process.env.NCPS_REFRESH_INTERVAL_MS,
      ncpsStartupMaxRetries: process.env.NCPS_STARTUP_MAX_RETRIES,
      ncpsRetryBackoffMs: process.env.NCPS_RETRY_BACKOFF_MS,
      ncpsRetryBackoffFactor: process.env.NCPS_RETRY_BACKOFF_FACTOR,
      ncpsAllowStartWithoutKey: process.env.NCPS_ALLOW_START_WITHOUT_KEY,
      ncpsCaBundle: process.env.NCPS_CA_BUNDLE,
      ncpsRotationGraceMinutes: process.env.NCPS_ROTATION_GRACE_MINUTES,
      ncpsAuthHeader: process.env.NCPS_AUTH_HEADER,
      ncpsAuthToken: process.env.NCPS_AUTH_TOKEN,
      agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL,
      corsOrigins: process.env.CORS_ORIGINS,
    });
    const config = new ConfigService().init(parsed);
    ConfigService.register(config);
    return config;
  }
}
