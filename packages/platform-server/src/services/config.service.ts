import * as dotenv from "dotenv";
import { z } from "zod";
dotenv.config();

export const configSchema = z.object({
  githubAppId: z.string().min(1, "GitHub App ID is required"),
  githubAppPrivateKey: z.string().min(1, "GitHub App Private Key is required"),
  githubInstallationId: z.string().min(1, "GitHub Installation ID is required"),
  openaiApiKey: z.string().min(1, "OpenAI API key is required"),
  githubToken: z.string().min(1, "GitHub personal access token is required"),
  mongodbUrl: z.string().min(1, "MongoDB connection string is required"),
  // Graph persistence
  graphStore: z.enum(['mongo', 'git']).default('mongo'),
  graphRepoPath: z.string().default('./data/graph'),
  graphBranch: z.string().default('graph-state'),
  graphAuthorName: z.string().optional(),
  graphAuthorEmail: z.string().optional(),
  // Optional Vault flags (disabled by default)
  vaultEnabled: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v)),
  vaultAddr: z.string().optional(),
  vaultToken: z.string().optional(),
  // Docker registry mirror URL (used by DinD sidecar)
  dockerMirrorUrl: z.string().min(1).default('http://registry-mirror:5000'),
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
    .transform((v) => Number(v) || 5000),
  nixCacheTtlMs: z
    .union([z.string(), z.number()])
    .default(String(5 * 60_000))
    .transform((v) => Number(v) || 5 * 60_000),
  nixCacheMax: z
    .union([z.string(), z.number()])
    .default('500')
    .transform((v) => Number(v) || 500),
  // Global MCP tools cache staleness timeout (ms). 0 => never stale by time.
  mcpToolsStaleTimeoutMs: z
    .union([z.string(), z.number()])
    .default('0')
    .transform((v) => Number(v) || 0),
  // NCPS (Nix Cache Proxy Server) settings
  ncpsEnabled: z
    .union([z.boolean(), z.string()])
    .default('false')
    .transform((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : !!v)),
  ncpsUrl: z.string().min(1).default('http://ncps:8501'),
  ncpsPublicKey: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigService implements Config {
  constructor(private params: Config) {}

  get githubAppId(): string {
    return this.params.githubAppId;
  }

  get githubAppPrivateKey(): string {
    return this.params.githubAppPrivateKey;
  }
  get githubInstallationId(): string {
    return this.params.githubInstallationId;
  }

  get openaiApiKey(): string {
    return this.params.openaiApiKey;
  }
  get githubToken(): string {
    return this.params.githubToken;
  }

  get mongodbUrl(): string {
    return this.params.mongodbUrl;
  }

  // Graph config accessors
  get graphStore(): 'mongo' | 'git' {
    return this.params.graphStore;
  }
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
    return this.params.dockerMirrorUrl || 'http://registry-mirror:5000';
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
  get ncpsUrl(): string {
    return this.params.ncpsUrl;
  }
  get ncpsPublicKey(): string | undefined {
    return this.params.ncpsPublicKey;
  }

  static fromEnv(): ConfigService {
    const parsed = configSchema.parse({
      githubAppId: process.env.GITHUB_APP_ID,
      githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      githubInstallationId: process.env.GITHUB_INSTALLATION_ID,
      openaiApiKey: process.env.OPENAI_API_KEY,
      githubToken: process.env.GH_TOKEN,
      mongodbUrl: process.env.MONGODB_URL,
      // Pass raw env; schema will validate/assign default
      graphStore: process.env.GRAPH_STORE,
      graphRepoPath: process.env.GRAPH_REPO_PATH,
      graphBranch: process.env.GRAPH_BRANCH,
      graphAuthorName: process.env.GRAPH_AUTHOR_NAME,
      graphAuthorEmail: process.env.GRAPH_AUTHOR_EMAIL,
      vaultEnabled: process.env.VAULT_ENABLED,
      vaultAddr: process.env.VAULT_ADDR,
      vaultToken: process.env.VAULT_TOKEN,
      dockerMirrorUrl: process.env.DOCKER_MIRROR_URL,
      nixAllowedChannels: process.env.NIX_ALLOWED_CHANNELS,
      nixHttpTimeoutMs: process.env.NIX_HTTP_TIMEOUT_MS,
      nixCacheTtlMs: process.env.NIX_CACHE_TTL_MS,
      nixCacheMax: process.env.NIX_CACHE_MAX,
      mcpToolsStaleTimeoutMs: process.env.MCP_TOOLS_STALE_TIMEOUT_MS,
      ncpsEnabled: process.env.NCPS_ENABLED,
      ncpsUrl: process.env.NCPS_URL,
      ncpsPublicKey: process.env.NCPS_PUBLIC_KEY,
    });
    return new ConfigService(parsed);
  }
}
