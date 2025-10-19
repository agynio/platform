import { MongoClient, Db } from 'mongodb';
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';

export class MongoService {
  private client?: MongoClient;
  private db?: Db;

  constructor(
    private config: ConfigService,
    private logger: LoggerService,
  ) {}

  async connect() {
    if (this.client) return; // already connected
    this.client = new MongoClient(this.config.mongodbUrl, {
      maxPoolSize: 20,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 60000,
      heartbeatFrequencyMS: 10000,
    });
    await this.client.connect();
    this.db = this.client.db('test');
    this.logger.info('Mongo connected');
  }

  getDb(): Db {
    if (!this.db) throw new Error('Mongo not connected');
    return this.db;
  }

  getClient(): MongoClient {
    if (!this.client) throw new Error('Mongo not connected');
    return this.client;
  }

  async close() {
    if (this.client) {
      await this.client.close(true);
      this.logger.info('Mongo connection closed');
    }
  }
}
