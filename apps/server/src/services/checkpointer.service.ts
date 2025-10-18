import { Collection, ChangeStream, Document, Binary, ObjectId, Db, MongoClient } from 'mongodb';
import { LoggerService } from './logger.service';
import { MongoDBSaver } from '../checkpointer';
// Optional Postgres saver (enabled via env flag)
// Note: UI stream features (fetchLatestWrites/watchInserts) remain Mongo-only for now.
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

// Raw document interface (previously in MongoService)
export interface RawCheckpointWrite extends Document {
  _id: ObjectId;
  checkpoint_ns?: string;
  checkpoint_id: string;
  thread_id: string;
  idx: number;
  task_id: string;
  channel: string;
  type: string;
  value: Binary | any;
}

export interface CheckpointWriteNormalized {
  id: string;
  checkpointId: string;
  threadId: string;
  taskId: string;
  channel: string;
  type: string;
  idx: number;
  value: any;
  createdAt: Date;
  checkpointNs?: string; // mapped from raw.checkpoint_ns
}

export class CheckpointerService {
  private collection?: Collection<RawCheckpointWrite>;
  private pgSaver?: PostgresSaver;
  constructor(
    private logger: LoggerService,
    private mongoClient?: MongoClient,
  ) {}

  bindDb(db: Db) {
    this.collection = db.collection<RawCheckpointWrite>('checkpoint_writes');
  }

  attachMongoClient(client: MongoClient) {
    this.mongoClient = client;
  }

  /**
   * Initialize Postgres checkpointer if enabled via LANGGRAPH_CHECKPOINTER=postgres.
   * Mongo remains initialized/bound for other services and UI streaming.
   */
  async initIfNeeded(): Promise<void> {
    const mode = (process.env.LANGGRAPH_CHECKPOINTER || '').toLowerCase();
    if (mode !== 'postgres') {
      this.logger.info('CheckpointerService using MongoDB (default).');
      return;
    }
    const url = process.env.POSTGRES_URL;
    if (!url) {
      const msg = 'POSTGRES_URL is required when LANGGRAPH_CHECKPOINTER=postgres';
      this.logger.error(msg);
      throw new Error(msg);
    }
    try {
      this.pgSaver = PostgresSaver.fromConnString(url);
      await this.pgSaver.setup(); // idempotent
      this.logger.info('Postgres checkpointer initialized.');
    } catch (e) {
      const err = e as Error;
      this.logger.error('Failed to initialize Postgres checkpointer: %s', err?.message || String(e));
      throw e;
    }
  }

  ensureBound() {
    if (!this.collection) throw new Error('CheckpointerService not bound to DB');
  }

  normalize(raw: RawCheckpointWrite): CheckpointWriteNormalized {
    let decoded: any = raw.value;
    try {
      if (raw.value && (raw.value as any)._bsontype === 'Binary') {
        const b = raw.value as Binary;
        const buf = (b as any).buffer; // underlying Buffer
        const text = Buffer.isBuffer(buf) ? buf.toString('utf8') : Buffer.from(buf).toString('utf8');
        try {
          decoded = JSON.parse(text);
        } catch (err) {
          this.logger.error('Failed to parse Binary JSON text', err);
          decoded = text;
        }
      }
    } catch (err) {
      this.logger.error('Error decoding checkpoint write value', err);
    }
    return {
      id: raw._id.toHexString(),
      checkpointId: raw.checkpoint_id,
      threadId: raw.thread_id,
      taskId: raw.task_id,
      channel: raw.channel,
      type: raw.type,
      idx: raw.idx,
      value: decoded,
      createdAt: raw._id.getTimestamp(),
      checkpointNs: raw.checkpoint_ns,
    };
  }

  async fetchLatestWrites(
    filter?: { threadId?: string; agentId?: string },
    limit = 50,
  ): Promise<CheckpointWriteNormalized[]> {
    this.ensureBound();
    const mongoFilter: Document = {};
    if (filter?.threadId) mongoFilter.thread_id = filter.threadId;
    if (filter?.agentId) mongoFilter.agentId = filter.agentId;
    const docs = await this.collection!.find(mongoFilter).sort({ _id: -1 }).limit(limit).toArray();
    docs.reverse();
    return docs.map((d) => this.normalize(d));
  }

  watchInserts(filter?: { threadId?: string; agentId?: string }): ChangeStream<RawCheckpointWrite> {
    this.ensureBound();
    const match: any = { operationType: 'insert' };
    if (filter?.threadId) match['fullDocument.thread_id'] = filter.threadId;
    if (filter?.agentId) match['fullDocument.agentId'] = filter.agentId;
    return this.collection!.watch([{ $match: match }], { fullDocument: 'updateLookup' });
  }

  getCheckpointer(agentId: string) {
    const mode = (process.env.LANGGRAPH_CHECKPOINTER || '').toLowerCase();
    if (mode === 'postgres') {
      if (!this.pgSaver) {
        throw new Error('Postgres checkpointer not initialized. Call initIfNeeded() during server bootstrap.');
      }
      return this.pgSaver;
    }
    // Default Mongo path (also powers UI stream via change streams)
    if (!this.mongoClient) {
      throw new Error('MongoClient not attached to CheckpointerService');
    }
    return new MongoDBSaver({ client: this.mongoClient }, undefined, { agentId });
  }
}
