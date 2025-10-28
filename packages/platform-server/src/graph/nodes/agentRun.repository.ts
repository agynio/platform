import { Collection, IndexSpecification, WithId } from 'mongodb';
import { Inject, Injectable } from '@nestjs/common';
import { LoggerService } from '../../core/services/logger.service';
import { MongoService } from '../../core/services/mongo.service';

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

@Injectable()
export class AgentRunService {
  private col: Collection<AgentRunDoc>;

  constructor(
    @Inject(MongoService) private mongo: MongoService,
    @Inject(LoggerService) private logger: LoggerService,
  ) {
    this.col = this.mongo.getDb().collection<AgentRunDoc>('agent_runs');
  }

  async ensureIndexes(): Promise<void> {
    // Build options explicitly to avoid casts; include only known properties
    const idx1Key: IndexSpecification = { nodeId: 1, runId: 1 };
    const idx1Opts = { name: 'uniq_node_run', unique: true } as const;

    const idx2Key: IndexSpecification = { nodeId: 1, status: 1, updatedAt: -1 };
    const idx2Opts = { name: 'by_node_status' } as const;

    const idx3Key: IndexSpecification = { expiresAt: 1 };
    const idx3Opts = { name: 'ttl_expires', expireAfterSeconds: 0 } as const;

    const plan: Array<{
      key: IndexSpecification;
      opts: { name?: string; unique?: boolean; expireAfterSeconds?: number };
    }> = [
      { key: idx1Key, opts: idx1Opts },
      { key: idx2Key, opts: idx2Opts },
      { key: idx3Key, opts: idx3Opts },
    ];
    const results = await Promise.allSettled(
      plan.map(({ key, opts }) => {
        const options = {
          ...(opts.name ? { name: opts.name } : {}),
          ...(opts.unique ? { unique: opts.unique } : {}),
          ...(typeof opts.expireAfterSeconds === 'number' ? { expireAfterSeconds: opts.expireAfterSeconds } : {}),
        } as const;
        return this.col.createIndex(key, options);
      }),
    );
    results.forEach((r) => {
      if (r.status === 'rejected') {
        const reason = (r.reason as Error)?.message || String(r.reason);
        this.logger.debug?.('createIndex failed (non-fatal)', reason);
      }
    });
  }

  async startRun(nodeId: string, threadId: string, runId: string): Promise<void> {
    const now = new Date();
    await this.col.updateOne(
      { nodeId, runId },
      {
        $setOnInsert: { nodeId, threadId, runId, startedAt: now },
        $set: { status: 'running' as AgentRunStatus, updatedAt: now },
        $unset: { expiresAt: true },
      },
      { upsert: true },
    );
  }

  async markTerminating(nodeId: string, runId: string): Promise<'ok' | 'not_found' | 'already' | 'not_running'> {
    // Idempotent transition to 'terminating' with explicit state checks.
    // 1) not found -> 'not_found'
    // 2) already 'terminating' -> 'already'
    // 3) in ['terminated','completed'] -> 'not_running'
    // 4) else set 'terminating' and return 'ok'
    const doc = await this.col.findOne({ nodeId, runId });
    if (!doc) return 'not_found';

    if (doc.status === 'terminating') return 'already';

    if (doc.status === 'terminated' || (doc as { status?: string }).status === 'completed') {
      return 'not_running';
    }

    const now = new Date();
    await this.col.updateOne(
      { _id: (doc as WithId<AgentRunDoc>)._id },
      { $set: { status: 'terminating' as AgentRunStatus, updatedAt: now }, $unset: { expiresAt: true } },
    );
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
