import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { DockerEventFilters } from '@agyn/docker-runner';
import { DOCKER_CLIENT, type DockerClient } from './dockerClient.token';
import { ContainerEventProcessor, type DockerEventMessage } from './containerEvent.processor';

const MAX_BACKOFF_MS = 30_000;
const INITIAL_BACKOFF_MS = 1_000;

type DockerEventStream = NodeJS.ReadableStream & { destroy?: () => void };

@Injectable()
export class DockerWorkspaceEventsWatcher implements OnModuleDestroy {
  private running = false;
  private currentStream?: DockerEventStream;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private buffer = '';
  private eventsProcessed = 0;
  private lastEventSeconds?: number;
  private readonly eventsFactory: ((options: { since?: number; filters?: DockerEventFilters }) => Promise<DockerEventStream>) | null;
  private readonly logger = new Logger(DockerWorkspaceEventsWatcher.name);

  constructor(
    @Inject(DOCKER_CLIENT) private readonly containerService: DockerClient,
    @Inject(ContainerEventProcessor) private readonly processor: ContainerEventProcessor,
  ) {
    const candidate = (this.containerService as unknown as {
      getEventsStream?: (options: { since?: number; filters?: DockerEventFilters }) => Promise<DockerEventStream>;
    })?.getEventsStream;
    if (typeof candidate === 'function') {
      this.eventsFactory = (options) => candidate.call(this.containerService, options);
    } else {
      this.logger.warn('DockerWorkspaceEventsWatcher: getEventsStream not available; watcher disabled');
      this.eventsFactory = null;
    }
  }

  start(): void {
    if (this.running) return;
    if (!this.eventsFactory) {
      this.logger.log('DockerWorkspaceEventsWatcher: skipped start (events unavailable)');
      return;
    }
    this.running = true;
    this.logger.log('DockerWorkspaceEventsWatcher: starting');
    void this.connect(true);
  }

  onModuleDestroy(): void {
    this.stop();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.clearStream();
  }

  private async connect(initial = false): Promise<void> {
    if (!this.running || !this.eventsFactory) return;
    const since = this.lastEventSeconds ?? Math.floor(Date.now() / 1000);
    const filters: DockerEventFilters = {
      type: ['container'] as Array<'container'>,
      event: ['create', 'start', 'stop', 'die', 'kill', 'destroy', 'restart', 'oom', 'health_status'],
      label: ['hautech.ai/role=workspace'],
    };

    this.logger.log('DockerWorkspaceEventsWatcher: subscribing to events', {
      since,
      attempt: this.reconnectAttempt,
      initial,
    });

    try {
      const stream = await this.eventsFactory({ since, filters });
      this.currentStream = stream;
      this.buffer = '';
      this.reconnectAttempt = 0;

      stream.on('data', (chunk) => this.handleChunk(chunk));
      stream.on('error', (error) => this.handleStreamError(error));
      stream.on('end', () => this.handleStreamClosed('end'));
      stream.on('close', () => this.handleStreamClosed('close'));
    } catch (error) {
      this.logger.error('DockerWorkspaceEventsWatcher: failed to subscribe to events', { error });
      this.scheduleReconnect();
    }
  }

  private handleChunk(chunk: unknown): void {
    if (!chunk) return;
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    this.buffer += text;

    while (true) {
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) break;
      const raw = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (!raw) continue;
      try {
        const event = JSON.parse(raw) as DockerEventMessage;
        this.eventsProcessed += 1;
        const since = this.extractSince(event);
        if (since) this.lastEventSeconds = since;
        if (this.eventsProcessed % 100 === 0) {
          this.logger.debug('DockerWorkspaceEventsWatcher: events processed', {
            eventsProcessed: this.eventsProcessed,
            lastEventSeconds: this.lastEventSeconds,
          });
        }
        this.processor.enqueue(event);
      } catch (err) {
        this.logger.error('DockerWorkspaceEventsWatcher: failed to parse event payload', { payload: raw, error: err });
      }
    }
  }

  private handleStreamError(error: unknown): void {
    if (!this.running) return;
    this.logger.error('DockerWorkspaceEventsWatcher: stream error', { error });
    this.clearStream();
    this.scheduleReconnect();
  }

  private handleStreamClosed(reason: 'end' | 'close'): void {
    if (!this.running) return;
    this.logger.warn('DockerWorkspaceEventsWatcher: stream closed', { reason });
    this.clearStream();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.running || !this.eventsFactory) return;
    if (this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(MAX_BACKOFF_MS, INITIAL_BACKOFF_MS * Math.pow(2, this.reconnectAttempt - 1));
    this.logger.log('DockerWorkspaceEventsWatcher: scheduling reconnect', { delay, attempt: this.reconnectAttempt });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  private extractSince(event: DockerEventMessage): number | undefined {
    if (typeof event.time === 'number' && event.time > 0) return event.time;
    if (typeof event.timeNano === 'number' && event.timeNano > 0) {
      return Math.floor(event.timeNano / 1_000_000_000);
    }
    return undefined;
  }

  private clearStream(): void {
    if (!this.currentStream) return;
    try {
      this.currentStream.removeAllListeners('data');
      this.currentStream.removeAllListeners('error');
      this.currentStream.removeAllListeners('end');
      this.currentStream.removeAllListeners('close');
      this.currentStream.destroy?.();
    } catch {
      // ignore cleanup errors
    }
    this.currentStream = undefined;
  }
}
