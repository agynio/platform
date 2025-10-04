import { MongoClient, Db, Collection, CreateIndexesOptions } from 'mongodb';
import { SpanDocument } from './types.js';

export class MongoService {
  private client: MongoClient;
  private db: Db | null = null;
  private connected = false;

  constructor(private mongoUrl: string) {
    this.client = new MongoClient(mongoUrl);
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    await this.client.connect();
    this.db = this.client.db('observability');
    this.connected = true;

    await this.setupIndexes();
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;

    await this.client.close();
    this.connected = false;
    this.db = null;
  }

  getSpansCollection(): Collection<SpanDocument> {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db.collection<SpanDocument>('spans');
  }

  async isConnected(): Promise<boolean> {
    if (!this.connected || !this.db) return false;

    try {
      await this.db.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  private async setupIndexes(): Promise<void> {
    if (!this.db) return;

    const collection = this.getSpansCollection();
    
    const indexes: Array<{ key: Record<string, 1 | -1>; options: CreateIndexesOptions }> = [
      // Unique index on traceId + spanId
      {
        key: { traceId: 1, spanId: 1 },
        options: { unique: true },
      },
      // Compound index for queries by status and lastUpdate
      {
        key: { status: 1, lastUpdate: -1 },
        options: {},
      },
      // Index for time-based queries
      {
        key: { startTime: -1 },
        options: {},
      },
      // Partial index for running spans (performance optimization)
      {
        key: { completed: 1, lastUpdate: -1 },
        options: { 
          partialFilterExpression: { completed: false },
          name: 'running_spans_idx'
        },
      },
      // TTL index for automatic cleanup (30 days)
      {
        key: { updatedAt: 1 },
        options: { 
          expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
          name: 'ttl_idx'
        },
      },
    ];

    for (const { key, options } of indexes) {
      try {
        await collection.createIndex(key, options);
      } catch (error) {
        console.error('Failed to create index:', { key, options, error });
      }
    }
  }
}