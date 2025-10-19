import { describe, it, expect } from 'vitest';
import { GitGraphService } from '../src/services/gitGraph.service';
import { LoggerService } from '../src/services/logger.service';
import { TemplateRegistry } from '../src/graph/templateRegistry';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

describe('Graph node.state round-trip (git)', () => {
  it('persists and loads node.state', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-')); 
    const logger = new LoggerService();
    const tr = new TemplateRegistry();
    tr.register(
      'mcpServer',
      async () => ({ setConfig: () => {} } as any),
      { targetPorts: { $self: { kind: 'instance' } } },
      { title: 'MCP Server', kind: 'mcp' as const },
    );
    const svc = new GitGraphService({ repoPath: dir, branch: 'graph-state', defaultAuthor: { name: 'Test', email: 't@example.com' } }, logger, tr as any);
    await svc.initIfNeeded();
    const saved = await svc.upsert({
      name: 'main',
      version: 0,
      nodes: [
        { id: 'n1', template: 'mcpServer', config: { command: 'x' }, state: { mcp: { tools: [{ name: 't1' }], toolsUpdatedAt: 123 } } as any },
      ],
      edges: [],
    });
    expect((saved.nodes[0] as any).state?.mcp?.tools?.[0]?.name).toBe('t1');
    const loaded = await svc.get('main');
    expect((loaded!.nodes[0] as any).state?.mcp?.tools?.[0]?.name).toBe('t1');
  });

  it('preserves existing node.state when omitted in upsert', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-'));
    const logger = new LoggerService();
    const tr = new TemplateRegistry();
    tr.register(
      'mcpServer',
      async () => ({ setConfig: () => {} } as any),
      { targetPorts: { $self: { kind: 'instance' } } },
      { title: 'MCP Server', kind: 'mcp' as const },
    );
    const svc = new GitGraphService({ repoPath: dir, branch: 'graph-state', defaultAuthor: { name: 'Test', email: 't@example.com' } }, logger, tr as any);
    await svc.initIfNeeded();
    const initial = await svc.upsert({
      name: 'main',
      version: 0,
      nodes: [
        { id: 'n1', template: 'mcpServer', state: { mcp: { tools: [{ name: 'keep' }], toolsUpdatedAt: 1 } } as any },
      ],
      edges: [],
    });
    // Upsert without state for the same node
    const saved = await svc.upsert({
      name: 'main',
      version: initial.version,
      nodes: [ { id: 'n1', template: 'mcpServer' } ],
      edges: [],
    });
    expect((saved.nodes[0] as any).state?.mcp?.tools?.[0]?.name).toBe('keep');
    const loaded = await svc.get('main');
    expect((loaded!.nodes[0] as any).state?.mcp?.tools?.[0]?.name).toBe('keep');
  });

  it('explicit null clears node.state; undefined preserves', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-'));
    const logger = new LoggerService();
    const tr = new TemplateRegistry();
    tr.register(
      'mcpServer',
      async () => ({ setConfig: () => {} } as any),
      { targetPorts: { $self: { kind: 'instance' } } },
      { title: 'MCP Server', kind: 'mcp' as const },
    );
    const svc = new GitGraphService({ repoPath: dir, branch: 'graph-state', defaultAuthor: { name: 'Test', email: 't@example.com' } }, logger, tr as any);
    await svc.initIfNeeded();
    const first = await svc.upsert({
      name: 'main',
      version: 0,
      nodes: [
        { id: 'n1', template: 'mcpServer', state: { mcp: { tools: [{ name: 'x' }], toolsUpdatedAt: 1 } } as any },
      ],
      edges: [],
    });
    expect((first.nodes[0] as any).state?.mcp?.tools?.[0]?.name).toBe('x');
    // undefined (omitted) preserves
    const preserved = await svc.upsert({ name: 'main', version: first.version, nodes: [{ id: 'n1', template: 'mcpServer' }], edges: [] });
    expect((preserved.nodes[0] as any).state?.mcp?.tools?.[0]?.name).toBe('x');
    // explicit null clears
    const cleared = await svc.upsert({ name: 'main', version: preserved.version, nodes: [{ id: 'n1', template: 'mcpServer', state: null as any }], edges: [] });
    expect((cleared.nodes[0] as any).state).toBeNull();
    const loaded = await svc.get('main');
    expect((loaded!.nodes[0] as any).state).toBeNull();
  });

  it('multi-node upsert: preserve omitted, apply provided, clear null; note on order guarantees', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'graph-'));
    const logger = new LoggerService();
    const tr = new TemplateRegistry();
    tr.register(
      'mcpServer',
      async () => ({ setConfig: () => {} } as any),
      { targetPorts: { $self: { kind: 'instance' } } },
      { title: 'MCP Server', kind: 'mcp' as const },
    );
    const svc = new GitGraphService({ repoPath: dir, branch: 'graph-state', defaultAuthor: { name: 'Test', email: 't@example.com' } }, logger, tr as any);
    await svc.initIfNeeded();
    const initial = await svc.upsert({
      name: 'main',
      version: 0,
      nodes: [
        { id: 'A', template: 'mcpServer', state: { mcp: { tools: [{ name: 'keepA' }] } } as any },
        { id: 'B', template: 'mcpServer', state: { mcp: { tools: [{ name: 'oldB' }] } } as any },
        { id: 'C', template: 'mcpServer', state: { mcp: { tools: [{ name: 'oldC' }] } } as any },
      ],
      edges: [],
    });
    const next = await svc.upsert({
      name: 'main',
      version: initial.version,
      nodes: [
        { id: 'A', template: 'mcpServer' }, // omit -> preserve
        { id: 'B', template: 'mcpServer', state: { mcp: { tools: [{ name: 'newB' }] } } as any }, // provided -> apply
        { id: 'C', template: 'mcpServer', state: null as any }, // null -> clear
      ],
      edges: [],
    });
    // Node order from git-backed store is not guaranteed; assert by id lookup
    const byId = new Map(next.nodes.map((n) => [n.id, n]));
    expect(((byId.get('A') as any).state?.mcp?.tools?.[0]?.name)).toBe('keepA');
    expect(((byId.get('B') as any).state?.mcp?.tools?.[0]?.name)).toBe('newB');
    expect(((byId.get('C') as any).state)).toBeNull();
  });
});
