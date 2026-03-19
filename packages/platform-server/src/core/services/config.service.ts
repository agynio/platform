import { Injectable, Logger } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();

export const configSchema = z.object({
  // GitHub settings are optional to allow dev boot without GitHub
  githubAppId: z.string().min(1).optional(),
  githubAppPrivateKey: z.string().min(1).optional(),
  githubInstallationId: z.string().min(1).optional(),
  // LLM provider selection defaults to LiteLLM
  llmProvider: z.enum(['openai', 'litellm']).default('litellm'),
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
  litellmKeyAlias: z
    .string()
    .min(1, 'LITELLM_KEY_ALIAS is required')
    .transform((value) => value.trim()),
  litellmKeyDuration: z
    .string()
    .min(1, 'LITELLM_KEY_DURATION is required')
    .transform((value) => value.trim()),
  litellmModels: z
    .array(z.string().min(1))
    .default(['all-team-models'])
    .transform((models) => models.map((model) => model.trim()).filter((model) => model.length > 0)),
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
  dockerRunnerTimeoutMs: z
    .union([z.string(), z.number()])
    .default('30000')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) ? num : 30_000;
    }),
  dockerRunnerGrpcHost: z.string().default('127.0.0.1'),
  dockerRunnerGrpcPort: z
    .union([z.string(), z.number()])
    .default('50051')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) ? num : 50051;
    }),
  dockerRunnerOptional: z
    .union([z.boolean(), z.string()])
    .default('true')
    .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v)),
  dockerRunnerConnectRetryBaseDelayMs: z
    .union([z.string(), z.number()])
    .default('500')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) && num > 0 ? num : 500;
    }),
  dockerRunnerConnectRetryMaxDelayMs: z
    .union([z.string(), z.number()])
    .default('30000')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) && num > 0 ? num : 30_000;
    }),
  dockerRunnerConnectRetryJitterMs: z
    .union([z.string(), z.number()])
    .default('250')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) && num >= 0 ? num : 250;
    }),
  dockerRunnerConnectProbeIntervalMs: z
    .union([z.string(), z.number()])
    .default('30000')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) && num > 0 ? num : 30_000;
    }),
  dockerRunnerConnectMaxRetries: z
    .union([z.string(), z.number()])
    .default('0')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) && num >= 0 ? num : 0;
    }),
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
  notificationsGrpcAddr: z.string().min(1).optional(),
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
  volumeGcSweepTimeoutMs: z
    .union([z.string(), z.number()])
    .default('15000')
    .transform((v) => {
      const num = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(num) && num >= 0 ? num : 15_000;
    }),
});

export type Config = z.infer<typeof configSchema>;

@Injectable()
export class ConfigService implements Config {
  private static readonly logger = new Logger(ConfigService.name);
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
  get litellmKeyAlias(): string {
    return this.params.litellmKeyAlias;
  }
  get litellmKeyDuration(): string {
    return this.params.litellmKeyDuration;
  }
  get litellmModels(): string[] {
    return this.params.litellmModels;
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

  get dockerRunnerTimeoutMs(): number {
    return this.params.dockerRunnerTimeoutMs;
  }

  get dockerRunnerGrpcHost(): string {
    return this.params.dockerRunnerGrpcHost;
  }

  get dockerRunnerGrpcPort(): number {
    return this.params.dockerRunnerGrpcPort;
  }

  get dockerRunnerOptional(): boolean {
    return this.params.dockerRunnerOptional;
  }

  get dockerRunnerConnectRetryBaseDelayMs(): number {
    return this.params.dockerRunnerConnectRetryBaseDelayMs;
  }

  get dockerRunnerConnectRetryMaxDelayMs(): number {
    return this.params.dockerRunnerConnectRetryMaxDelayMs;
  }

  get dockerRunnerConnectRetryJitterMs(): number {
    return this.params.dockerRunnerConnectRetryJitterMs;
  }

  get dockerRunnerConnectProbeIntervalMs(): number {
    return this.params.dockerRunnerConnectProbeIntervalMs;
  }

  get dockerRunnerConnectMaxRetries(): number {
    return this.params.dockerRunnerConnectMaxRetries;
  }

  get volumeGcSweepTimeoutMs(): number {
    return this.params.volumeGcSweepTimeoutMs;
  }

  getDockerRunnerGrpcAddress(): string {
    return `${this.dockerRunnerGrpcHost}:${this.dockerRunnerGrpcPort}`;
  }

  getDockerRunnerTimeoutMs(): number {
    return this.dockerRunnerTimeoutMs;
  }

  getDockerRunnerOptional(): boolean {
    return this.dockerRunnerOptional;
  }

  getDockerRunnerConnectRetryBaseDelayMs(): number {
    return this.dockerRunnerConnectRetryBaseDelayMs;
  }

  getDockerRunnerConnectRetryMaxDelayMs(): number {
    return this.dockerRunnerConnectRetryMaxDelayMs;
  }

  getDockerRunnerConnectRetryJitterMs(): number {
    return this.dockerRunnerConnectRetryJitterMs;
  }

  getDockerRunnerConnectProbeIntervalMs(): number {
    return this.dockerRunnerConnectProbeIntervalMs;
  }

  getDockerRunnerConnectMaxRetries(): number {
    return this.dockerRunnerConnectMaxRetries;
  }

  getVolumeGcSweepTimeoutMs(): number {
    return this.volumeGcSweepTimeoutMs;
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
  get notificationsGrpcAddr(): string | undefined {
    return this.params.notificationsGrpcAddr;
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
    const llmProvider = ConfigService.normalizeLlmProvider(process.env.LLM_PROVIDER);
    const openaiApiKey = ConfigService.resolveLegacyOpenAiKey(llmProvider, process.env.OPENAI_API_KEY);
    const openaiBaseUrl = ConfigService.resolveLegacyOpenAiBaseUrl(llmProvider, process.env.OPENAI_BASE_URL);
    const litellmKeyAlias = ConfigService.resolveLiteLlmKeyAlias(process.env);
    const litellmKeyDuration = ConfigService.coerceString(process.env.LITELLM_KEY_DURATION) ?? '30d';
    const litellmModels = ConfigService.parseCsv(process.env.LITELLM_MODELS, ['all-team-models']);
    const legacy = process.env.NCPS_URL;
    const urlServer = process.env.NCPS_URL_SERVER || legacy;
    const urlContainer = process.env.NCPS_URL_CONTAINER || legacy;
    const graphRepoPathEnv = process.env.GRAPH_REPO_PATH;
    const graphBranchEnv = process.env.GRAPH_BRANCH;
    const dockerRunnerPortEnv = process.env.DOCKER_RUNNER_PORT ?? process.env.DOCKER_RUNNER_GRPC_PORT;
    const parsed = configSchema.parse({
      githubAppId: process.env.GITHUB_APP_ID,
      githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      githubInstallationId: process.env.GITHUB_INSTALLATION_ID,
      llmProvider,
      openaiApiKey,
      openaiBaseUrl,
      litellmBaseUrl: ConfigService.coerceString(process.env.LITELLM_BASE_URL),
      litellmMasterKey: ConfigService.coerceString(process.env.LITELLM_MASTER_KEY),
      litellmKeyAlias,
      litellmKeyDuration,
      litellmModels,
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
      dockerRunnerTimeoutMs: process.env.DOCKER_RUNNER_TIMEOUT_MS,
      dockerRunnerGrpcHost: process.env.DOCKER_RUNNER_GRPC_HOST,
      dockerRunnerGrpcPort: dockerRunnerPortEnv,
      dockerRunnerOptional: process.env.DOCKER_RUNNER_OPTIONAL,
      dockerRunnerConnectRetryBaseDelayMs: process.env.DOCKER_RUNNER_CONNECT_RETRY_BASE_DELAY_MS,
      dockerRunnerConnectRetryMaxDelayMs: process.env.DOCKER_RUNNER_CONNECT_RETRY_MAX_DELAY_MS,
      dockerRunnerConnectRetryJitterMs: process.env.DOCKER_RUNNER_CONNECT_RETRY_JITTER_MS,
      dockerRunnerConnectProbeIntervalMs: process.env.DOCKER_RUNNER_CONNECT_PROBE_INTERVAL_MS,
      dockerRunnerConnectMaxRetries: process.env.DOCKER_RUNNER_CONNECT_MAX_RETRIES,
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
      notificationsGrpcAddr: ConfigService.coerceString(process.env.NOTIFICATIONS_GRPC_ADDR),
      agentsDatabaseUrl: process.env.AGENTS_DATABASE_URL,
      corsOrigins: process.env.CORS_ORIGINS,
      volumeGcSweepTimeoutMs: process.env.VOLUME_GC_SWEEP_TIMEOUT_MS,
    });
    const config = new ConfigService().init(parsed);
    ConfigService.register(config);
    return config;
  }

  private static normalizeLlmProvider(value: string | undefined): 'openai' | 'litellm' {
    const trimmed = ConfigService.coerceString(value);
    if (!trimmed) {
      return 'litellm';
    }

    const normalized = trimmed.toLowerCase();
    if (normalized === 'openai' || normalized === 'litellm') {
      return normalized;
    }

    throw new Error(
      `LLM_PROVIDER must be either "litellm" or "openai", received "${trimmed}"`,
    );
  }

  private static resolveLegacyOpenAiKey(
    provider: 'openai' | 'litellm',
    candidate: string | undefined,
  ): string | undefined {
    const trimmed = ConfigService.coerceString(candidate);
    if (provider === 'openai' && trimmed) {
      ConfigService.logger.warn('OPENAI_API_KEY is deprecated; LiteLLM is the default provider.');
      return trimmed;
    }
    return undefined;
  }

  private static resolveLegacyOpenAiBaseUrl(
    provider: 'openai' | 'litellm',
    candidate: string | undefined,
  ): string | undefined {
    const trimmed = ConfigService.coerceString(candidate);
    if (provider === 'openai' && trimmed) {
      ConfigService.logger.warn('OPENAI_BASE_URL is deprecated; LiteLLM is the default provider.');
      return trimmed;
    }
    return undefined;
  }

  private static resolveLiteLlmKeyAlias(env: NodeJS.ProcessEnv): string {
    const explicit = ConfigService.coerceString(env.LITELLM_KEY_ALIAS);
    if (explicit) {
      return explicit;
    }

    const envName = (ConfigService.coerceString(env.AGENTS_ENV) ?? ConfigService.coerceString(env.NODE_ENV) ?? 'local')
      .replace(/\s+/g, '-');
    const deployment =
      ConfigService.coerceString(env.AGENTS_DEPLOYMENT) ??
      ConfigService.coerceString(env.DEPLOYMENT_ID) ??
      'platform-server';
    return `agents/${envName}/${deployment.replace(/\s+/g, '-')}`;
  }

  private static parseCsv(value: string | undefined, fallback: string[]): string[] {
    const trimmed = ConfigService.coerceString(value);
    if (!trimmed) {
      return fallback;
    }
    const parts = trimmed
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts : fallback;
  }

  private static coerceString(value: string | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
}
