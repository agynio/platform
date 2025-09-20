import { MongoClient, Db, Collection, ChangeStream, Document, Binary, ObjectId } from "mongodb";
import { ConfigService } from "./config.service";
import { LoggerService } from "./logger.service";

export interface RawCheckpointWrite extends Document {
  _id: ObjectId;
  checkpoint_ns?: string;
  checkpoint_id: string;
  thread_id: string;
  idx: number;
  task_id: string;
  channel: string;
  type: string;
  value: Binary | any; // raw stored value (Binary encoded JSON array) or already decoded
}

export interface CheckpointWriteNormalized {
  id: string; // hex string of _id
  checkpointId: string;
  threadId: string;
  taskId: string;
  channel: string;
  type: string;
  idx: number;
  value: any; // decoded JSON value
  createdAt: Date; // derived from ObjectId timestamp
}

export class MongoService {
  private client?: MongoClient;
  private db?: Db;

  constructor(private config: ConfigService, private logger: LoggerService) {}

  async connect() {
    if (this.client) return; // already connected
    this.client = new MongoClient(this.config.mongodbUrl);
    await this.client.connect();
    this.db = this.client.db("test");
    this.logger.info("Mongo connected");
  }

  get collection(): Collection<RawCheckpointWrite> {
    if (!this.db) throw new Error("Mongo not connected");
    return this.db.collection<RawCheckpointWrite>("checkpoint_writes");
  }

  async fetchLatestWrites(filter?: { threadId?: string; checkpointId?: string }, limit = 50): Promise<CheckpointWriteNormalized[]> {
    const mongoFilter: Document = {};
    if (filter?.threadId) mongoFilter.thread_id = filter.threadId;
    if (filter?.checkpointId) mongoFilter.checkpoint_id = filter.checkpointId;
    const docs = await this.collection
      .find(mongoFilter)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray();
    docs.reverse(); // chronological
    return docs.map(d => this.normalize(d));
  }

  watchInserts(filter?: { threadId?: string; checkpointId?: string }): ChangeStream<RawCheckpointWrite> {
    const match: any = { operationType: "insert" };
    if (filter?.threadId) match["fullDocument.thread_id"] = filter.threadId;
    if (filter?.checkpointId) match["fullDocument.checkpoint_id"] = filter.checkpointId;
    return this.collection.watch([{ $match: match }], { fullDocument: "updateLookup" });
  }

  normalize(raw: RawCheckpointWrite): CheckpointWriteNormalized {
    let decoded: any = raw.value;
    try {
      if (raw.value && raw.value._bsontype === "Binary") {
        const b = raw.value as Binary;
  const buf = b.buffer; // underlying Buffer (typed loosely)
  // Normalize to Node Buffer explicitly to satisfy TS when type is ArrayBuffer | Buffer
  const text = Buffer.isBuffer(buf) ? buf.toString("utf8") : Buffer.from(buf).toString("utf8");
        try {
          decoded = JSON.parse(text);
        } catch (err) {
          this.logger.error("Failed to parse Binary JSON text", err);
          decoded = text; // fallback to raw text
        }
      }
    } catch (err) {
      this.logger.error("Error decoding checkpoint write value", err);
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
    };
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.logger.info("Mongo connection closed");
    }
  }
}
