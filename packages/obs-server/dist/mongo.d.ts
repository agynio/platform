import { Collection } from 'mongodb';
import { SpanDocument } from './types.js';
export declare class MongoService {
    private mongoUrl;
    private client;
    private db;
    private connected;
    constructor(mongoUrl: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getSpansCollection(): Collection<SpanDocument>;
    isConnected(): Promise<boolean>;
    private setupIndexes;
}
