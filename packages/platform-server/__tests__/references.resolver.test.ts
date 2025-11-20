import { describe, expect, it, vi } from 'vitest';
import type { SecretRef, VariableRef } from '@agyn/shared';
import { resolveReferences, ResolveError } from '../src/utils/references';

const secretRef = (overrides?: Partial<SecretRef>): SecretRef => ({
  kind: 'vault',
  mount: 'secret',
  path: 'services/slack',
  key: 'BOT_TOKEN',
  ...overrides,
});

const variableRef = (overrides?: Partial<VariableRef>): VariableRef => ({
  kind: 'var',
  name: 'SLACK_CHANNEL',
  default: 'general',
  ...overrides,
});

describe('resolveReferences', () => {
  it('resolves nested secret and variable references', async () => {
    const providers = {
      secret: vi.fn(async (ref: SecretRef) => `${ref.mount ?? 'secret'}:${ref.key}`),
      variable: vi.fn(async (ref: VariableRef) => `${ref.name}-val`),
    };

    const input = {
      nodes: [
        {
          config: {
            tokens: {
              bot: secretRef(),
              channel: variableRef(),
            },
            env: ['plain', secretRef({ key: 'APP_TOKEN' })],
          },
        },
      ],
    };

    const { output, report } = await resolveReferences(input, providers, { basePath: '/graph' });

    expect(output.nodes[0].config.tokens.bot).toBe('secret:BOT_TOKEN');
    expect(output.nodes[0].config.tokens.channel).toBe('SLACK_CHANNEL-val');
    expect(output.nodes[0].config.env[1]).toBe('secret:APP_TOKEN');
    expect(providers.secret).toHaveBeenCalledTimes(2);
    expect(providers.variable).toHaveBeenCalledTimes(1);
    expect(report.counts.total).toBe(3);
    expect(report.events.every((ev) => ev.path.startsWith('/graph'))).toBe(true);
  });

  it('memoizes repeated references when enabled', async () => {
    const providers = {
      secret: vi.fn(async () => 'cached-value'),
      variable: vi.fn(async () => 'cached-var'),
    };

    const input = [secretRef(), secretRef(), { nested: variableRef(), again: variableRef() }];
    const { output } = await resolveReferences(input, providers);
    expect(output[0]).toBe('cached-value');
    expect(output[1]).toBe('cached-value');
    expect(output[2].nested).toBe('cached-var');
    expect(output[2].again).toBe('cached-var');
    expect(providers.secret).toHaveBeenCalledTimes(1);
    expect(providers.variable).toHaveBeenCalledTimes(1);
  });

  it('throws when provider missing in strict mode', async () => {
    const input = secretRef();
    await expect(resolveReferences(input, {}, { strict: true })).rejects.toMatchObject({
      code: 'provider_missing',
      source: 'secret',
    });
  });

  it('returns lenient fallback when provider missing and strict=false', async () => {
    const input = { token: secretRef() };
    const { output } = await resolveReferences(input, {}, { strict: false, lenientUnresolvedValue: 'keep' });
    expect(output.token).toEqual(secretRef());
  });

  it('uses variable default when lenientUnresolvedValue=default', async () => {
    const providers = { variable: vi.fn(async () => undefined) };
    const input = variableRef({ default: 'fallback' });
    const { output } = await resolveReferences(input, providers, {
      strict: false,
      lenientUnresolvedValue: 'default',
    });
    expect(output).toBe('fallback');
  });

  it('maps permission denied errors from secret provider', async () => {
    const providers = {
      secret: vi.fn(async () => {
        const err = new Error('forbidden');
        (err as { statusCode?: number }).statusCode = 403;
        throw err;
      }),
    };
    await expect(resolveReferences(secretRef(), providers)).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  it('detects cycles when enabled', async () => {
    const providers = {
      secret: vi.fn(async () => 'value'),
    };
    const cyc: Record<string, unknown> = { ref: secretRef() };
    cyc.self = cyc;
    await expect(resolveReferences(cyc, providers)).rejects.toBeInstanceOf(ResolveError);
  });

  it('enforces maxDepth option', async () => {
    const providers = {
      secret: vi.fn(async () => 'value'),
    };
    const input = { level1: { level2: { level3: secretRef() } } };
    await expect(resolveReferences(input, providers, { maxDepth: 2 })).rejects.toMatchObject({
      code: 'max_depth_exceeded',
    });
  });

  it('returns null when lenientUnresolvedValue=null', async () => {
    const providers = { secret: vi.fn(async () => undefined) };
    const input = { token: secretRef() };
    const { output } = await resolveReferences(input, providers, {
      strict: false,
      lenientUnresolvedValue: 'null',
    });
    expect(output.token).toBeNull();
  });

  it('does not treat legacy {value, source} objects as references', async () => {
    const input = { token: { value: 'abc', source: 'static' } };
    const { output } = await resolveReferences(input, { secret: vi.fn() });
    expect(output).toEqual(input);
  });

  it('produces resolution report with cache hits and counts', async () => {
    const providers = {
      secret: vi.fn(async () => 'resolved'),
    };
    const input = [secretRef(), secretRef({ key: 'OTHER' }), secretRef()];
    const { report } = await resolveReferences(input, providers);
    expect(report.counts.total).toBe(3);
    expect(report.counts.resolved).toBe(3);
    expect(report.counts.cacheHits).toBeGreaterThanOrEqual(1);
    expect(report.events.length).toBe(3);
  });
});
