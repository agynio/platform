import { Injectable } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();

const booleanFlag = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => {
      if (typeof value === 'boolean') return value;
      const normalized = value.trim().toLowerCase();
      if (!normalized) return defaultValue;
      if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
      return defaultValue;
    });

const numberFlag = (defaultValue: number) =>
  z
    .union([z.string(), z.number()])
    .default(String(defaultValue))
    .transform((value) => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : defaultValue;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    });

const trimUrl = (value: string): string => value.trim().replace(/\/+$/, '');

const normalizeOptionalUrl = (value?: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimUrl(trimmed);
};

const defaultZitiConfig = {
  managementUrl: 'https://127.0.0.1:1280/edge/management/v1',
  username: 'admin',
  password: 'admin',
  insecureTls: true,
  serviceName: 'dev.agyn-platform.platform-api',
  routerName: 'dev-edge-router',
  runnerProxyHost: '127.0.0.1',
  runnerProxyPort: 17071,
  platformIdentityName: 'dev.agyn-platform.platform-server',
  platformIdentityFile: '.ziti/identities/dev.agyn-platform.platform-server.json',
  runnerIdentityName: 'dev.agyn-platform.docker-runner',
  runnerIdentityFile: '.ziti/identities/dev.agyn-platform.docker-runner.json',
  identitiesDir: '.ziti/identities',
  tmpDir: '.ziti/tmp',
  enrollmentTtlSeconds: 900,
} as const;

export const configSchema = z.object({
  // GitHub settings are optional to allow dev boot without GitHub
  githubAppId: z.string().min(1).optional(),
  githubAppPrivateKey: z.string().min(1).optional(),
  githubInstallationId: z.string().min(1).optional(),
  // LLM provider selection: must be explicit; no default
  llmProvider: z.enum(['openai', 'litellm']),
  openaiApiKey: z.string().optional(),
  openaiBaseUrl: z.string().optional(),
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
  githubToken: z.string().min(1).optional(),
  // Graph persistence
  graphRepoPath: z.string().default('./data/graph'),
  graphBranch: z
    .string()
    .default('main')
    .transform((value) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : 'main';
    }),
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
  dockerRunnerSharedSecret: z
    .string()
    .min(1, 'DOCKER_RUNNER_SHARED_SECRET is required')
    .transform((value) => value.trim()),
  dockerRunnerTimeoutMs: z
    .union([z.string(), z.number()])
    .default('30000')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) ? num : 30_000;
    }),
  dockerRunnerBaseUrl: z
    .union([z.string(), z.undefined()])
    .transform((value) => normalizeOptionalUrl(value))
    .refine(
      (value) => !value || /^https?:\/\//.test(value),
      'DOCKER_RUNNER_BASE_URL must include http:// or https://',
    ),
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
  ziti: z
    .object({
      managementUrl: z
        .string()
        .min(1, 'ZITI_MANAGEMENT_URL is required')
        .default(defaultZitiConfig.managementUrl)
        .transform((value) => trimUrl(value)),
      username: z.string().min(1, 'ZITI_USERNAME is required').default(defaultZitiConfig.username),
      password: z.string().min(1, 'ZITI_PASSWORD is required').default(defaultZitiConfig.password),
      insecureTls: booleanFlag(defaultZitiConfig.insecureTls),
      serviceName: z
        .string()
        .min(1, 'ZITI_SERVICE_NAME is required')
        .default(defaultZitiConfig.serviceName),
      routerName: z.string().min(1, 'ZITI_ROUTER_NAME is required').default(defaultZitiConfig.routerName),
      runnerProxyHost: z
        .string()
        .min(1, 'ZITI_RUNNER_PROXY_HOST is required')
        .default(defaultZitiConfig.runnerProxyHost),
      runnerProxyPort: numberFlag(defaultZitiConfig.runnerProxyPort).refine(
        (value) => value > 0,
        'ZITI_RUNNER_PROXY_PORT must be a positive integer',
      ),
      platformIdentityName: z
        .string()
        .min(1, 'ZITI_PLATFORM_IDENTITY_NAME is required')
        .default(defaultZitiConfig.platformIdentityName),
      platformIdentityFile: z
        .string()
        .min(1, 'ZITI_PLATFORM_IDENTITY_FILE is required')
        .default(defaultZitiConfig.platformIdentityFile),
      runnerIdentityName: z
        .string()
        .min(1, 'ZITI_RUNNER_IDENTITY_NAME is required')
        .default(defaultZitiConfig.runnerIdentityName),
      runnerIdentityFile: z
        .string()
        .min(1, 'ZITI_RUNNER_IDENTITY_FILE is required')
        .default(defaultZitiConfig.runnerIdentityFile),
      identitiesDir: z
        .string()
        .min(1, 'ZITI_IDENTITIES_DIR is required')
        .default(defaultZitiConfig.identitiesDir),
      tmpDir: z.string().min(1, 'ZITI_TMP_DIR is required').default(defaultZitiConfig.tmpDir),
      enrollmentTtlSeconds: numberFlag(defaultZitiConfig.enrollmentTtlSeconds).refine(
        (value) => value > 0,
        'ZITI_ENROLLMENT_TTL_SECONDS must be positive',
      ),
    })
    .default(() => ({ ...defaultZitiConfig })),
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

  get githubAppId(): string | undefined {
    return this.params.githubAppId;
  }

  get githubAppPrivateKey(): string | undefined {
    return this.params.githubAppPrivateKey;
  }
  get githubInstallationId(): string | undefined {
    return this.params.githubInstallationId;
  }

  get llmProvider(): 'openai' | 'litellm' {
    return this.params.llmProvider;
  }
  get openaiApiKey(): string | undefined {
    return this.params.openaiApiKey;
  }
  get openaiBaseUrl(): string | undefined {
    return this.params.openaiBaseUrl;
  }
  get litellmBaseUrl(): string {
    return this.params.litellmBaseUrl;
  }
  get litellmMasterKey(): string {
    return this.params.litellmMasterKey;
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

  get dockerRunnerSharedSecret(): string {
    return this.params.dockerRunnerSharedSecret;
  }

  get dockerRunnerTimeoutMs(): number {
    return this.params.dockerRunnerTimeoutMs;
  }

  getDockerRunnerBaseUrl(): string {
    const explicit = this.params.dockerRunnerBaseUrl;
    if (explicit) {
      return explicit;
    }
    const host = this.getZitiRunnerProxyHost();
    const port = this.getZitiRunnerProxyPort();
    if (!host) {
      throw new Error('ZITI_RUNNER_PROXY_HOST is required when starting the platform-server');
    }
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error('ZITI_RUNNER_PROXY_PORT must be a positive integer');
    }
    return `http://${host}:${port}`;
  }

  getDockerRunnerSharedSecret(): string {
    return this.dockerRunnerSharedSecret;
  }

  getDockerRunnerTimeoutMs(): number {
    return this.dockerRunnerTimeoutMs;
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

  get ziti(): Config['ziti'] {
    return this.params.ziti;
  }

  get zitiConfig(): Config['ziti'] {
    return this.ziti;
  }

  getZitiManagementUrl(): string {
    return this.params.ziti.managementUrl;
  }

  getZitiCredentials(): { username: string; password: string } {
    return { username: this.params.ziti.username, password: this.params.ziti.password };
  }

  getZitiInsecureTls(): boolean {
    return this.params.ziti.insecureTls;
  }

  getZitiServiceName(): string {
    return this.params.ziti.serviceName;
  }

  getZitiRouterName(): string {
    return this.params.ziti.routerName;
  }

  getZitiRunnerProxyHost(): string {
    return this.params.ziti.runnerProxyHost;
  }

  getZitiRunnerProxyPort(): number {
    return this.params.ziti.runnerProxyPort;
  }

  getZitiPlatformIdentity(): { name: string; file: string } {
    return {
      name: this.params.ziti.platformIdentityName,
      file: this.params.ziti.platformIdentityFile,
    };
  }

  getZitiRunnerIdentity(): { name: string; file: string } {
    return {
      name: this.params.ziti.runnerIdentityName,
      file: this.params.ziti.runnerIdentityFile,
    };
  }

  getZitiIdentityDirectory(): string {
    return this.params.ziti.identitiesDir;
  }

  getZitiTmpDirectory(): string {
    return this.params.ziti.tmpDir;
  }

  getZitiEnrollmentTtlSeconds(): number {
    return this.params.ziti.enrollmentTtlSeconds;
  }

  // No global messaging adapter config in Slack-only v1

  static fromEnv(): ConfigService {
    const legacy = process.env.NCPS_URL;
    const urlServer = process.env.NCPS_URL_SERVER || legacy;
    const urlContainer = process.env.NCPS_URL_CONTAINER || legacy;
    const graphRepoPathEnv = process.env.GRAPH_REPO_PATH;
    const graphBranchEnv = process.env.GRAPH_BRANCH;
    const parsed = configSchema.parse({
      githubAppId: process.env.GITHUB_APP_ID,
      githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      githubInstallationId: process.env.GITHUB_INSTALLATION_ID,
      llmProvider: process.env.LLM_PROVIDER,
      litellmBaseUrl: process.env.LITELLM_BASE_URL,
      litellmMasterKey: process.env.LITELLM_MASTER_KEY,
      githubToken: process.env.GH_TOKEN,
      // Pass raw env; schema will validate/assign default
      graphRepoPath: graphRepoPathEnv,
      graphBranch: graphBranchEnv,
      graphAuthorName: process.env.GRAPH_AUTHOR_NAME,
      graphAuthorEmail: process.env.GRAPH_AUTHOR_EMAIL,
      graphLockTimeoutMs: process.env.GRAPH_LOCK_TIMEOUT_MS,
      vaultEnabled: process.env.VAULT_ENABLED,
      vaultAddr: process.env.VAULT_ADDR,
      vaultToken: process.env.VAULT_TOKEN,
      dockerMirrorUrl: process.env.DOCKER_MIRROR_URL,
      dockerRunnerSharedSecret: process.env.DOCKER_RUNNER_SHARED_SECRET,
      dockerRunnerTimeoutMs: process.env.DOCKER_RUNNER_TIMEOUT_MS,
      dockerRunnerBaseUrl: process.env.DOCKER_RUNNER_BASE_URL,
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
      ziti: {
        managementUrl: process.env.ZITI_MANAGEMENT_URL,
        username: process.env.ZITI_USERNAME,
        password: process.env.ZITI_PASSWORD,
        insecureTls: process.env.ZITI_INSECURE_TLS,
        serviceName: process.env.ZITI_SERVICE_NAME,
        routerName: process.env.ZITI_ROUTER_NAME,
        runnerProxyHost: process.env.ZITI_RUNNER_PROXY_HOST,
        runnerProxyPort: process.env.ZITI_RUNNER_PROXY_PORT,
        platformIdentityName: process.env.ZITI_PLATFORM_IDENTITY_NAME,
        platformIdentityFile: process.env.ZITI_PLATFORM_IDENTITY_FILE,
        runnerIdentityName: process.env.ZITI_RUNNER_IDENTITY_NAME,
        runnerIdentityFile: process.env.ZITI_RUNNER_IDENTITY_FILE,
        identitiesDir: process.env.ZITI_IDENTITIES_DIR,
        tmpDir: process.env.ZITI_TMP_DIR,
        enrollmentTtlSeconds: process.env.ZITI_ENROLLMENT_TTL_SECONDS,
      },
    });
    const config = new ConfigService().init(parsed);
    ConfigService.register(config);
    return config;
  }
}
