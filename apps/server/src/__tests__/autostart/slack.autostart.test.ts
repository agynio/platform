import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autostartSlackTriggerNodes } from '../../autostart';

class MockLogger {
  info = vi.fn();
  debug = vi.fn();
  error = vi.fn();
}

const mkRuntime = (nodes: Array<{ id: string; template: string; state: 'not_ready'|'provisioning'|'ready' }>) => {
  const statuses = new Map(nodes.map(n => [n.id, { provisionStatus: { state: n.state } }]));
  return {
    getNodes: () => nodes,
    getNodeStatus: (id: string) => statuses.get(id) as any,
    provisionNode: vi.fn(async (id: string) => { statuses.set(id, { provisionStatus: { state: 'provisioning' } }); }),
  } as any;
};

class MockWatcher {
  started: string[] = [];
  start = (id: string) => { this.started.push(id); };
}

describe('Slack autostart', () => {
  beforeEach(() => { vi.resetModules(); });

  it('provisions only SlackTrigger nodes that are not ready', async () => {
    const runtime = mkRuntime([
      { id: 'a', template: 'slackTrigger', state: 'not_ready' },
      { id: 'b', template: 'slackTrigger', state: 'ready' },
      { id: 'c', template: 'simpleAgent', state: 'not_ready' },
    ]);
    const logger = new MockLogger() as any;
    const watcher = new MockWatcher() as any;
    await autostartSlackTriggerNodes(runtime, logger, watcher);
    expect(runtime.provisionNode).toHaveBeenCalledTimes(1);
    expect(runtime.provisionNode).toHaveBeenCalledWith('a');
    expect(watcher.started).toEqual(['a']);
  });

  it('respects AUTO_START_SLACK_TRIGGER gate', async () => {
    process.env.AUTO_START_SLACK_TRIGGER = 'false';
    const runtime = mkRuntime([{ id: 'a', template: 'slackTrigger', state: 'not_ready' }]);
    const logger = new MockLogger() as any;
    const watcher = new MockWatcher() as any;
    await autostartSlackTriggerNodes(runtime, logger, watcher);
    expect(runtime.provisionNode).not.toHaveBeenCalled();
    process.env.AUTO_START_SLACK_TRIGGER = undefined;
  });
});
