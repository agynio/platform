import { MongoClient } from 'mongodb';
export class MongoService {
    mongoUrl;
    client;
    db = null;
    connected = false;
    constructor(mongoUrl) {
        this.mongoUrl = mongoUrl;
        this.client = new MongoClient(mongoUrl);
    }
    async connect() {
        if (this.connected)
            return;
        await this.client.connect();
        this.db = this.client.db('observability');
        this.connected = true;
        await this.setupIndexes();
    }
    async disconnect() {
        if (!this.connected)
            return;
        await this.client.close();
        this.connected = false;
        this.db = null;
    }
    getSpansCollection() {
        if (!this.db) {
            throw new Error('Database not connected');
        }
        return this.db.collection('spans');
    }
    async isConnected() {
        if (!this.connected || !this.db)
            return false;
        try {
            await this.db.admin().ping();
            return true;
        }
        catch {
            return false;
        }
    }
    async setupIndexes() {
        if (!this.db)
            return;
        const collection = this.getSpansCollection();
        const indexes = [
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
            }
            catch (error) {
                console.error('Failed to create index:', { key, options, error });
            }
        }
    }
}
//# sourceMappingURL=mongo.js.map