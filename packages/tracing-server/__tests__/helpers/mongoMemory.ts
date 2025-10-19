import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Db } from 'mongodb';

export interface MemoryMongo {
  uri: string;
  db: Db;
  client: MongoClient;
  stop: () => Promise<void>;
}

export async function startMemoryMongo(dbName = 'obs-e2e'): Promise<MemoryMongo> {
  const mongod = await MongoMemoryServer.create({ instance: { dbName } });
  const uri = mongod.getUri();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  return {
    uri,
    db,
    client,
    stop: async () => {
      await client.close();
      await mongod.stop();
    },
  };
}
