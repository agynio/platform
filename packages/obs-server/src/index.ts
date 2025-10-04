import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { createServer } from './server';

const PORT = Number(process.env.PORT || 4319);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/obs';

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db();
  const server = await createServer(db, { logger: true });
  await server.listen({ port: PORT, host: '0.0.0.0' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
