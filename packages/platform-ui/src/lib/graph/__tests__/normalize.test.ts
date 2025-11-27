import { describe, it, expect } from 'vitest';
import { graph as api } from '@/api/modules/graph';
type TemplateName =
  | 'workspace'
  | 'shellTool'
  | 'sendSlackMessageTool'
  | 'slackTrigger'
  | 'githubCloneRepoTool'
  | 'mcpServer'
  | 'finishTool'
  | 'remindMeTool';
type TestNode = { id: string; template: TemplateName; config: Record<string, unknown> };
type TestGraph = { nodes: TestNode[] };

type NormalizeFn = (t: string, c: Record<string, unknown>) => Record<string, unknown>;
function getNormalize(x: object): NormalizeFn {
  const candidate = (x as { __test_normalize?: unknown }).__test_normalize;
  if (typeof candidate !== 'function') throw new Error('missing __test_normalize');
  return candidate as NormalizeFn;
}

// Re-import normalize via api.saveFullGraph serialization behavior

describe('normalizeConfigByTemplate idempotence and behavior', () => {
  it('converts env object to array, wraps tokens, renames workdir, removes extras', () => {
    const nodes: TestNode[] = [
      { id: '1', template: 'shellTool', config: { workingDir: '/w', env: { A: '1' } } },
      { id: '2', template: 'workspace', config: { env: { B: '2' }, workingDir: '/x', note: 'n' } },
      { id: '3', template: 'sendSlackMessageTool', config: { bot_token: 'xoxb-123', note: 'x' } },
      { id: '4', template: 'slackTrigger', config: { app_token: 'xapp-abc', bot_token: 'x', default_channel: '#g' } },
      { id: '5', template: 'githubCloneRepoTool', config: { token: 'tok', repoUrl: 'x', destPath: 'y', authToken: 'z' } },
      { id: '6', template: 'mcpServer', config: { env: { C: '3' }, image: 'alpine', toolDiscoveryTimeoutMs: 10 } },
      { id: '7', template: 'finishTool', config: { note: 'bye' } },
      { id: '8', template: 'remindMeTool', config: { maxActive: 3 } },
    ];

    const g: TestGraph = { nodes };
    // Access internal normalize by using the api and intercepting body
    const normalize = getNormalize(api);
    const body = JSON.parse(JSON.stringify({
      ...g,
      nodes: g.nodes.map((n) => ({
        ...n,
        config: normalize(n.template, n.config),
      })),
    }));

    const cfg1 = body.nodes[0].config;
    expect(cfg1.workdir).toBe('/w');
    expect(Array.isArray(cfg1.env) && cfg1.env[0].source === 'static').toBe(true);

    const cfg2 = body.nodes[1].config;
    expect(cfg2.env[0]).toEqual({ name: 'B', value: '2', source: 'static' });
    expect(cfg2.workingDir).toBeUndefined();
    expect(cfg2.note).toBeUndefined();

    const cfg3 = body.nodes[2].config;
    expect(cfg3.bot_token).toEqual({ value: 'xoxb-123', source: 'static' });

    const cfg4 = body.nodes[3].config;
    expect(cfg4.app_token).toEqual({ value: 'xapp-abc', source: 'static' });
    expect(cfg4.bot_token).toEqual({ value: 'x', source: 'static' });
    expect(cfg4.default_channel).toBeUndefined();

    const cfg5 = body.nodes[4].config;
    expect(cfg5.token).toEqual({ value: 'tok', source: 'static' });
    expect(cfg5.repoUrl).toBeUndefined();

    const cfg6 = body.nodes[5].config;
    expect(cfg6.env[0]).toEqual({ name: 'C', value: '3', source: 'static' });
    expect(cfg6.image).toBeUndefined();
    expect(cfg6.toolDiscoveryTimeoutMs).toBeUndefined();

    const cfg7 = body.nodes[6].config;
    expect(cfg7.note).toBeUndefined();
    const cfg8 = body.nodes[7].config;
    expect(cfg8.maxActive).toBeUndefined();
  });

  it('is idempotent across multiple runs', () => {
    const initialConfig: Record<string, unknown> = { workdir: '/w', env: [{ name: 'A', value: '1', source: 'static' }] };
    const initial = { template: 'shellTool' as const, config: initialConfig };
    const normalize = getNormalize(api);
    const once = normalize(initial.template, initial.config);
    const twice = normalize(initial.template, once);
    expect(twice).toEqual(once);
  });
});
