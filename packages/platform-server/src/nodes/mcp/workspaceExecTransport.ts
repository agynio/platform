import { Logger } from '@nestjs/common';
import { PassThrough } from 'node:stream';

import type { WorkspaceStdioSession } from '../../workspace/runtime/workspace.runtime.provider';
import type { JSONRPCMessage } from './types';

class ReadBufferInline {
  private buffer?: Buffer;

  append(chunk: Buffer) {
    this.buffer = this.buffer ? Buffer.concat([this.buffer, chunk]) : chunk;
  }

  readMessage(): JSONRPCMessage | null {
    if (!this.buffer) return null;
    const idx = this.buffer.indexOf('\n');
    if (idx === -1) return null;
    const line = this.buffer.toString('utf8', 0, idx).replace(/\r$/, '');
    this.buffer = this.buffer.subarray(idx + 1);
    try {
      return JSON.parse(line) as JSONRPCMessage;
    } catch {
      throw new Error('Failed to parse JSON-RPC line');
    }
  }

  clear() {
    this.buffer = undefined;
  }
}

const serializeMessageInline = (msg: JSONRPCMessage) => JSON.stringify(msg) + '\n';

export class WorkspaceExecTransport {
  onmessage?: (msg: JSONRPCMessage) => void;
  onerror?: (err: unknown) => void;
  onclose?: () => void;

  private readonly logger = new Logger(WorkspaceExecTransport.name);
  private readonly readBuffer = new ReadBufferInline();
  private session: WorkspaceStdioSession | null = null;
  private stdin?: NodeJS.WritableStream;
  private stdout = new PassThrough();
  private stderr = new PassThrough();
  private closed = false;
  private static seq = 0;
  private readonly id = ++WorkspaceExecTransport.seq;
  private started = false;

  constructor(private startSession: () => Promise<WorkspaceStdioSession>) {}

  async start(): Promise<void> {
    if (this.started) {
      this.logger.debug(`[WorkspaceExecTransport#${this.id}] start() called more than once; ignoring.`);
      return;
    }
    this.started = true;
    this.logger.log(`[WorkspaceExecTransport#${this.id}] START initiating exec session`);
    const session = await this.startSession();
    this.session = session;
    this.stdin = session.stdin;

    const stdoutStream = session.stdout ?? undefined;
    const stderrStream = session.stderr ?? undefined;

    if (!stdoutStream) {
      throw new Error('Interactive exec did not provide stdout stream');
    }

    stdoutStream.pipe(this.stdout);
    if (stderrStream) {
      stderrStream.pipe(this.stderr);
    }

    this.stdout.on('data', (chunk: Buffer) => {
      this.logger.debug(`[WorkspaceExecTransport#${this.id} stdout] ${chunk.toString().trim()}`);
      this.readBuffer.append(chunk);
      this.processReadBuffer();
    });
    this.stdout.on('error', (err) => this.onerror?.(err));

    this.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.trim().length > 0) {
        this.logger.error(`[WorkspaceExecTransport#${this.id} stderr] ${text.trim()}`);
      }
    });
    this.stderr.on('error', (err) => this.onerror?.(err));

    const closeTarget: NodeJS.ReadableStream = stdoutStream;
    closeTarget.on('end', () => this.handleClose());
    closeTarget.on('close', () => this.handleClose());
  }

  private processReadBuffer(): void {
    while (true) {
      try {
        const msg = this.readBuffer.readMessage();
        if (!msg) break;
        this.onmessage?.(msg);
      } catch (err) {
        this.onerror?.(err);
        break;
      }
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) throw new Error('Transport closed');
    const writable = this.stdin;
    if (!writable || (writable as NodeJS.WritableStream & { destroyed?: boolean }).destroyed) {
      throw new Error('Transport closed');
    }
    const payload = serializeMessageInline(message);
    return new Promise((resolve, reject) => {
      try {
        const ok = writable.write(payload, (err: unknown) => (err ? reject(err) : resolve()));
        if (!ok) writable.once('drain', resolve);
      } catch (err) {
        reject(err);
      }
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.stdin && typeof this.stdin.end === 'function') this.stdin.end();
    } catch {
      // ignore errors closing stdin
    }
    try {
      await this.session?.close().catch(() => undefined);
    } catch {
      // ignore close errors
    }
    this.logger.log(`[WorkspaceExecTransport#${this.id}] CLOSED`);
    this.onclose?.();
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.logger.log(`[WorkspaceExecTransport#${this.id}] STREAM CLOSED`);
    this.onclose?.();
  }
}
