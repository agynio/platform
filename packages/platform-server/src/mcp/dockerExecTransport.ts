import type { JSONRPCMessage } from './types.js';
import type Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import { LoggerService } from '../services/logger.service.js';

class ReadBufferInline {
  private _buffer?: Buffer;
  append(chunk: Buffer) {
    this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
  }
  readMessage(): JSONRPCMessage | null {
    if (!this._buffer) return null;
    const idx = this._buffer.indexOf('\n');
    if (idx === -1) return null;
    const line = this._buffer.toString('utf8', 0, idx).replace(/\r$/, '');
    this._buffer = this._buffer.subarray(idx + 1);
    try {
      return JSON.parse(line);
    } catch {
      throw new Error('Failed to parse JSON-RPC line');
    }
  }
  clear() {
    this._buffer = undefined;
  }
}
const serializeMessageInline = (msg: JSONRPCMessage) => JSON.stringify(msg) + '\n';

export class DockerExecTransport {
  onmessage?: (msg: JSONRPCMessage) => void;
  onerror?: (err: any) => void;
  onclose?: () => void;

  private _readBuffer = new ReadBufferInline();
  private _stdin!: NodeJS.WritableStream;
  private _stdout = new PassThrough();
  private _stderr = new PassThrough();
  private _closed = false;
  private static _seq = 0;
  private _id = ++DockerExecTransport._seq;
  private _started = false;

  constructor(
    private docker: Docker,
    private logger: LoggerService,
    private startExec: () => Promise<{
      stream?: any;
      stdin?: any;
      stdout?: any;
      stderr?: any;
      inspect: () => Promise<{ ExitCode?: number }>;
    }>,
    private options: { demux: boolean },
  ) {}

  async start(): Promise<void> {
    if (this._started) {
      // Downgraded to debug-level semantic (still using console.debug for simplicity)
      this.logger.debug(`[DockerExecTransport#${this._id}] start() called more than once; ignoring.`);
      return;
    }
    this._started = true;
    this.logger.info(`[DockerExecTransport#${this._id}] START initiating exec`);
    const started = await this.startExec();
    const { stream } = started;
    const stdin = started.stdin || stream;
    const stdout = started.stdout || undefined;
    const stderr = started.stderr || undefined;
    if (!stdin) throw new Error('No stdin stream provided');
    this._stdin = stdin;

    if (stdout) {
      stdout.pipe(this._stdout);
      if (stderr) stderr.pipe(this._stderr);
    } else if (stream) {
      if (this.options.demux) {
        this.docker.modem.demuxStream(stream, this._stdout, this._stderr);
      } else {
        stream.pipe(this._stdout);
      }
    }

    this._stdout.on('data', (chunk) => {
      this.logger.debug(`[DockerExecTransport#${this._id} stdout]`, chunk.toString().trim());
      this._readBuffer.append(chunk as Buffer);
      this.processReadBuffer();
    });
    this._stdout.on('error', (e) => this.onerror?.(e));
    this._stderr.on('data', (chunk) => {
      // Provide minimal stderr visibility without overwhelming logs; only log first few lines until handshake.
      const text = chunk.toString();
      if (text.trim().length > 0) {
        this.logger.error(`[DockerExecTransport#${this._id} stderr]`, text.trim());
      }
    });
    const closer = stream || stdout || this._stdout;
    closer.on('end', () => this.handleClose());
    closer.on('close', () => this.handleClose());
  }

  private processReadBuffer() {
    while (true) {
      try {
        const msg = this._readBuffer.readMessage() as JSONRPCMessage | null;
        if (msg === null) break;
        this.onmessage?.(msg);
      } catch (e) {
        this.onerror?.(e);
        break;
      }
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this._closed) throw new Error('Transport closed');
    if (!this._stdin || (this._stdin as any).writableEnded || (this._stdin as any).destroyed) {
      throw new Error('Transport closed');
    }
    const payload = serializeMessageInline(message);
    // console.debug('[DockerExecTransport send]', payload.trim());
    return new Promise((resolve, reject) => {
      try {
        const ok = this._stdin.write(payload, (err: unknown) => (err ? reject(err) : resolve()));
        if (!ok) this._stdin.once('drain', resolve);
      } catch (e) {
        reject(e);
      }
    });
  }

  async close(): Promise<void> {
    if (this._closed) return;
    this._closed = true;
    try {
      this._stdin.end();
    } catch {}
    this.logger.info(`[DockerExecTransport#${this._id}] CLOSED`);
    this.onclose?.();
  }

  private handleClose() {
    if (this._closed) return;
    this._closed = true;
    this.logger.info(`[DockerExecTransport#${this._id}] STREAM CLOSED`);
    this.onclose?.();
  }
}
