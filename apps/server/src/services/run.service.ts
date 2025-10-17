import { Collection, Db, IndexSpecification, WithId } from 'mongodb';
import { LoggerService } from './logger.service';

export type AgentRunStatus = 'running' | 'terminating' | 'terminated';

export type AgentRunDoc = {
  nodeId: string;
  threadId: string;
  runId: string;
  status: AgentRunStatus;
  startedAt: Date;
  updatedAt: Date;
  /** Optional expiration for TTL cleanup (used for short-lived 'terminated' display) */
  expiresAt?: Date;
};

export class AgentRunService {
  private col: Collection<AgentRunDoc>;

  constructor(private db: Db, private logger: LoggerService) {
    this.col = this.db.collection<AgentRunDoc>('agent_runs');
  }

  async ensureIndexes(): Promise<void> {
    const indexes: IndexSpecification[] = [
      { key: { nodeId: 1, runId: 1 }, name: 'uniq_node_run', unique: true },
      { key: { nodeId: 1, status: 1, updatedAt: -1 }, name: 'by_node_status' },
      { key: { expiresAt: 1 }, name: 'ttl_expires', expireAfterSeconds: 0 },
    ];
    for (const idx of indexes) {
      try {
        await this.col.createIndex(idx.key as any, idx as any);
      } catch (e) {
        this.logger.debug?.('createIndex failed (non-fatal)', (e as Error)?.message || String(e));
      }
    }
  }

  async startRun(nodeId: string, threadId: string, runId: string): Promise<void> {
    const now = new Date();
    await this.col.updateOne(
      { nodeId, runId },
      { $setOnInsert: { nodeId, threadId, runId, startedAt: now }, $set: { status: 'running' as AgentRunStatus, updatedAt: now }, $unset: { expiresAt: true } },
      { upsert: true },
    );
  }

  async markTerminating(nodeId: string, runId: string): Promise<'ok' | 'not_found' | 'already'> {
    const now = new Date();
    const res = await this.col.updateOne(
      { nodeId, runId },
      { $set: { status: 'terminating' as AgentRunStatus, updatedAt: now }, $unset: { expiresAt: true } },
    );
    if (res.matchedCount === 0) return 'not_found';
    if (res.modifiedCount === 0) return 'already'; // no state change
    return 'ok';
  }

  async markTerminated(nodeId: string, runId: string, displaySeconds = 10): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(1, displaySeconds) * 1000);
    try {
      await this.col.updateOne(
        { nodeId, runId },
        {
          $set: { status: 'terminated' as AgentRunStatus, updatedAt: now, expiresAt },
          $setOnInsert: { nodeId, runId, startedAt: now },
        },
        { upsert: true },
      );
    } catch (e) {
      this.logger.debug?.('markTerminated upsert failed', (e as Error)?.message || String(e));
    }
  }

  async clear(nodeId: string, runId: string): Promise<void> {
    await this.col.deleteOne({ nodeId, runId });
  }

  async list(nodeId: string, status: 'running' | 'terminating' | 'all' = 'all'): Promise<Array<WithId<AgentRunDoc>>> {
    const filter: Record<string, unknown> = { nodeId };
    if (status !== 'all') filter.status = status;
    else filter.status = { $in: ['running', 'terminating', 'terminated'] };
    return await this.col
      .find(filter, { sort: { updatedAt: -1 } })
      .limit(200)
      .toArray();
  }

  async findByRunId(nodeId: string, runId: string): Promise<WithId<AgentRunDoc> | null> {
    try {
      return await this.col.findOne({ nodeId, runId });
    } catch (e) {
      this.logger.debug?.('findByRunId failed', (e as Error)?.message || String(e));
      return null;
    }
  }
}
