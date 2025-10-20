import type { Db, Document, ChangeStream } from 'mongodb';
import { LoggerService } from './logger.service.js';

export type CheckpointWrite = {
  thread_id: string;
  checkpoint_id: string;
  task_id: string;
  idx: number;
  channel: string;
  type: string;
  value: any;
  agentId?: string;
  checkpoint_ns?: string;
};

export class CheckpointWritesService {
  constructor(private db: Db, private logger: LoggerService) {}

  private col() { return this.db.collection<CheckpointWrite>('checkpoint_writes'); }

  async append(write: CheckpointWrite): Promise<void> {
    await this.col().insertOne(write as any);
  }

  async fetchLatestWrites(filter?: { threadId?: string; agentId?: string }, limit = 50) {
    const mongoFilter: Document = {};
    if (filter?.threadId) mongoFilter.thread_id = filter.threadId;
    if (filter?.agentId) mongoFilter.agentId = filter.agentId;
    const docs = await this.col().find(mongoFilter).sort({ _id: -1 }).limit(limit).toArray();
    docs.reverse();
    return docs.map((d) => this.normalize(d as any));
  }

  watchInserts(filter?: { threadId?: string; agentId?: string }): ChangeStream<CheckpointWrite> {
    const match: any = { operationType: 'insert' };
    if (filter?.threadId) match['fullDocument.thread_id'] = filter.threadId;
    if (filter?.agentId) match['fullDocument.agentId'] = filter.agentId;
    return this.col().watch([{ $match: match }], { fullDocument: 'updateLookup' });
  }

  normalize(raw: any) {
    let decoded: any = raw.value;
    try {
      if (raw.value && raw.value._bsontype === 'Binary') {
        const b = raw.value as any;
        const buf = b.buffer;
        const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : Buffer.from(buf).toString('utf8');
        try { decoded = JSON.parse(text); } catch { decoded = text; }
      }
    } catch (err) {
      this.logger.error('Error decoding checkpoint write value', err);
    }
    return {
      id: raw._id?.toHexString?.() || String(raw._id),
      checkpointId: raw.checkpoint_id,
      threadId: raw.thread_id,
      taskId: raw.task_id,
      channel: raw.channel,
      type: raw.type,
      idx: raw.idx,
      value: decoded,
      createdAt: raw._id?.getTimestamp?.() || new Date(),
      checkpointNs: raw.checkpoint_ns,
    };
  }
}

// Accessor kept outside llloop to avoid unsafe global casts in strict modules
export function getCheckpointWritesGlobal(): CheckpointWritesService | undefined {
  const g = globalThis as unknown as { __checkpointWrites?: CheckpointWritesService };
  return g.__checkpointWrites;
}
