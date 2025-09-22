import { Server, Socket } from 'socket.io';
import { LoggerService } from './logger.service';
import { CheckpointerService } from './checkpointer.service';

interface InitPayload {
  threadId?: string;
  agentId?: string;
}

export class SocketService {
  constructor(
    private io: Server,
    private logger: LoggerService,
    private checkpointer: CheckpointerService,
  ) {}

  register() {
    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: Socket) {
    this.logger.info(`Socket connected ${socket.id}`);
    let closed = false;
    let stream: any; // ChangeStream

    const cleanup = async () => {
      if (stream) {
        try { await stream.close(); } catch (e) { this.logger.error('Error closing change stream', e); }
      }
      closed = true;
    };

    socket.on('disconnect', () => { cleanup(); });

    socket.on('init', async (payload: InitPayload) => {
      if (closed) return;
      try {
        const { checkpointId, ...rest } = payload as any; // backward compat discard
        const latest = await this.checkpointer.fetchLatestWrites(rest);
        socket.emit('initial', { items: latest });
        stream = this.checkpointer.watchInserts(rest);
        stream.on('change', (change: any) => {
          if (change.fullDocument) {
            const normalized = this.checkpointer.normalize(change.fullDocument);
            socket.emit('append', normalized);
          }
        });
        stream.on('error', (err: any) => {
          this.logger.error('Change stream error', err);
          socket.emit('error', { message: 'change stream error' });
        });
      } catch (err) {
        this.logger.error('Init error', err);
        socket.emit('error', { message: 'init error' });
      }
    });
  }
}
