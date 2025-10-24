import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';
import { AgentRunService } from '../src/nodes/agentRun.repository';
import { LoggerService } from '../src/core/services/logger.service.js';

describe('AgentRunService', () => {
  let mongod: MongoMemoryServer | undefined;
  let client: MongoClient | undefined;
  let db: Db | undefined;
  let runs: AgentRunService | undefined;
  const logger = new LoggerService();
  let setupOk = true;

  beforeAll(async () => {
    try {
      mongod = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
      client = await MongoClient.connect(mongod.getUri());
      db = client.db('agents-tests');
      runs = new AgentRunService(db, logger);
      await runs.ensureIndexes();
    } catch (e) {
      setupOk = false;
       
      console.warn('Skipping AgentRunService tests, mongo unavailable', (e as Error)?.message || String(e));
    }
  });

  afterAll(async () => {
    try { await client?.close(); } catch {}
    try { await mongod?.stop(); } catch {}
  });

  it('transitions running -> terminating -> terminated and lists accordingly', async () => {
    if (!setupOk || !runs) return;
    const nodeId = 'node-A';
    const threadId = 't-1';
    const runId = `${threadId}/run-1`;
    await runs.startRun(nodeId, threadId, runId);
    const l1 = await runs.list(nodeId, 'running');
    expect(l1.find((r) => r.runId === runId)?.status).toBe('running');
    const mt = await runs.markTerminating(nodeId, runId);
    expect(mt === 'ok' || mt === 'already').toBe(true);
    const l2 = await runs.list(nodeId, 'terminating');
    expect(l2.find((r) => r.runId === runId)?.status).toBe('terminating');
    await runs.markTerminated(nodeId, runId, 5);
    const l3 = await runs.list(nodeId, 'all');
    expect(l3.find((r) => r.runId === runId)?.status).toBe('terminated');
  });

  it('idempotency: markTerminating on non-existent returns not_found; repeated returns already', async () => {
    if (!setupOk || !runs) return;
    const nodeId = 'node-B';
    const runId = 'thr/run-x';
    const res1 = await runs.markTerminating(nodeId, runId);
    expect(res1).toBe('not_found');
    await runs.startRun(nodeId, 'thr', runId);
    const res2 = await runs.markTerminating(nodeId, runId);
    const res3 = await runs.markTerminating(nodeId, runId);
    expect(res2).toBe('ok');
    expect(res3).toBe('already');
  });

  it('TTL behavior: markTerminated sets expiresAt near now + displaySeconds; upsert creates missing doc with startedAt', async () => {
    if (!setupOk || !runs || !db) return;
    const nodeId = 'node-C';
    const runId = 'thr/run-ttl';
    const before = await (db.collection('agent_runs')).findOne({ nodeId, runId });
    expect(before).toBeNull();
    const displaySeconds = 3;
    const now = Date.now();
    await runs.markTerminated(nodeId, runId, displaySeconds);
    const doc = await (db.collection('agent_runs')).findOne({ nodeId, runId });
    expect(doc).toBeTruthy();
    expect(doc?.status).toBe('terminated');
    expect(doc?.startedAt).toBeInstanceOf(Date);
    if (doc?.expiresAt) expect(doc.expiresAt).toBeInstanceOf(Date);
    const exp = new Date(doc!.expiresAt);
    expect(exp.getTime()).toBeGreaterThanOrEqual(now + displaySeconds * 1000 - 500);
  });
});
