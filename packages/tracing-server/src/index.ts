import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { createServer, attachSpanSocket } from './server';
import { Server as SocketIOServer } from 'socket.io';

const PORT = Number(process.env.PORT || 4319);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/obs';

async function main() {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db();
  const server = await createServer(db, { logger: true });
  await server.listen({ port: PORT, host: '0.0.0.0' });
  // Attach socket.io (CORS permissive for now; tighten later with auth)
  const io = new SocketIOServer(server.server, { cors: { origin: '*' } });
  attachSpanSocket(io);
  server.log.info('Socket.io attached for span realtime events');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
