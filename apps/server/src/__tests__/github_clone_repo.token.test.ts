import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GithubCloneRepoTool } from '../tools/github_clone_repo';
import { LoggerService } from '../services/logger.service';
import type { VaultService } from '../services/vault.service';

const logger = new LoggerService();

describe('GithubCloneRepoTool token resolution', () => {
  const env = process.env;
  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...env };
    delete process.env.GH_TOKEN;
  });
  it('prefers static token value', async () => {
    const tool = new GithubCloneRepoTool({ githubToken: 'FALLBACK' } as any, undefined, logger);
    await tool.configure({ token: { value: 'DIRECT', source: 'static' } });
    // @ts-ignore access private method via cast
    const t = await (tool as any).resolveToken();
    expect(t).toBe('DIRECT');
  });
  it('falls back to env GH_TOKEN via legacy authRef', async () => {
    process.env.GH_TOKEN = 'FROM_ENV';
    const tool = new GithubCloneRepoTool({ githubToken: 'FALLBACK' } as any, undefined, logger);
    await tool.configure({ authRef: { source: 'env', envVar: 'GH_TOKEN' } });
    // @ts-ignore
    const t = await (tool as any).resolveToken();
    expect(t).toBe('FROM_ENV');
  });
  it('falls back to ConfigService when nothing provided', async () => {
    const tool = new GithubCloneRepoTool({ githubToken: 'FALLBACK' } as any, undefined, logger);
    await tool.configure({});
    // @ts-ignore
    const t = await (tool as any).resolveToken();
    expect(t).toBe('FALLBACK');
  });
  it('resolves from vault when token.source=vault', async () => {
    const vlt: Partial<VaultService> = { isEnabled: () => true, getSecret: vi.fn().mockResolvedValue('FROM_VAULT') };
    const tool = new GithubCloneRepoTool({ githubToken: 'FALLBACK' } as any, vlt as VaultService, logger);
    await tool.configure({ token: { value: 'secret/github/GH_TOKEN', source: 'vault' } });
    // @ts-ignore
    const t = await (tool as any).resolveToken();
    expect(t).toBe('FROM_VAULT');
  });
});
