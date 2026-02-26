import { Inject, Injectable, Logger } from '@nestjs/common';
import { type PrismaClient, ContainerEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/services/prisma.service';
import { ContainerReasonContext, ContainerEventReason, mapContainerEventReason, statusForEvent } from './containerEvent.reason';
import { validate as validateUuid } from 'uuid';
import type { ContainerHealthStatus } from './container.registry';

export interface DockerEventMessage {
  status?: string;
  Action?: string;
  Type?: string;
  id?: string;
  Id?: string;
  time?: number;
  timeNano?: number;
  Actor?: {
    ID?: string;
    Attributes?: Record<string, string>;
  };
}

const RECENT_OOM_WINDOW_MS = 15_000; // 15 seconds proximity window
const MISSING_STARTUP_SUPPRESS_MS = 10_000;
const STARTUP_EVENT_TYPES = new Set<ContainerEventType>(['create', 'start', 'restart']);

const ACTION_TO_EVENT_TYPE: Record<string, ContainerEventType> = {
  create: 'create',
  start: 'start',
  stop: 'stop',
  die: 'die',
  kill: 'kill',
  destroy: 'destroy',
  restart: 'restart',
  oom: 'oom',
  health_status: 'health_status',
};

type MutableMetadata = Record<string, unknown> & {
  autoRemoved?: boolean;
  health?: ContainerHealthStatus | string;
  lastEventAt?: string;
};

@Injectable()
export class ContainerEventProcessor {
  private prisma: PrismaClient;
  private queue: Promise<void> = Promise.resolve();
  private lastOomByContainer = new Map<string, number>();
  private missingStartupLogByContainer = new Map<string, number>();
  private readonly logger = new Logger(ContainerEventProcessor.name);

  constructor(
    @Inject(PrismaService) prismaService: PrismaService,
  ) {
    this.prisma = prismaService.getClient();
  }

  enqueue(event: DockerEventMessage): void {
    this.queue = this.queue.then(() => this.handle(event)).catch((err: unknown) => {
      this.logger.error('ContainerEventProcessor: error handling docker event', { error: err });
    });
  }

  async drain(): Promise<void> {
    await this.queue;
  }

  private async handle(event: DockerEventMessage): Promise<void> {
    if (event.Type && event.Type.toLowerCase() !== 'container') return;

    const eventType = this.resolveEventType(event);
    if (!eventType) return;

    const dockerId = event.id ?? event.Id ?? event.Actor?.ID;
    if (!dockerId) {
      this.logger.warn('ContainerEventProcessor: event missing container id', { event });
      return;
    }

    const attributes = event.Actor?.Attributes ?? {};
    const exitCode = this.parseExitCode(attributes);
    const signal = this.parseSignal(attributes);
    const health = eventType === 'health_status' ? this.parseHealthStatus(attributes, event) : undefined;
    const autoRemoved = eventType === 'destroy' ? this.parseAutoRemoved(attributes) : false;
    const eventTimeMs = this.eventTimestampMs(event);
    const createdAt = new Date(eventTimeMs);
    const createdAtIso = createdAt.toISOString();

    const container = await this.prisma.container.findFirst({
      where: {
        OR: [
          { dockerContainerId: dockerId },
          { containerId: dockerId },
        ],
      },
      select: { id: true, threadId: true, status: true, dockerContainerId: true, metadata: true, terminationReason: true },
    });

    if (!container) {
      if (eventType === 'oom') this.recordOom(dockerId, eventTimeMs);

      if (STARTUP_EVENT_TYPES.has(eventType)) {
        const now = Date.now();
        const lastLog = this.missingStartupLogByContainer.get(dockerId);
        if (!lastLog || now - lastLog >= MISSING_STARTUP_SUPPRESS_MS) {
          this.logger.debug('ContainerEventProcessor: container not yet registered for startup event', {
            dockerId: this.shortId(dockerId),
            eventType,
          });
          this.missingStartupLogByContainer.set(dockerId, now);
        }
        return;
      }

      this.logger.warn('ContainerEventProcessor: container not found for event', {
        dockerId: this.shortId(dockerId),
        eventType,
      });
      return;
    }

    this.missingStartupLogByContainer.delete(dockerId);

    const metadata = this.cloneMetadata(container.metadata) as MutableMetadata;
    const lastEventAtValue = typeof metadata.lastEventAt === 'string' ? metadata.lastEventAt : undefined;
    const lastEventAtMs = lastEventAtValue ? Date.parse(lastEventAtValue) : undefined;
    const isStale = typeof lastEventAtMs === 'number' && Number.isFinite(lastEventAtMs) && eventTimeMs < lastEventAtMs;
    const hadRecentOom = this.hasRecentOom(dockerId, eventTimeMs);

    const reasonContext: ContainerReasonContext = {
      eventType,
      exitCode,
      signal,
      hadRecentOom,
      health,
    };
    const reason: ContainerEventReason = mapContainerEventReason(reasonContext);
    const message = this.buildMessage(event, attributes, exitCode, signal, health);
    const threadId = this.resolveThreadId(container.threadId, attributes);

    await this.prisma.containerEvent.create({
      data: {
        containerDbId: container.id,
        eventType,
        exitCode: typeof exitCode === 'number' ? exitCode : null,
        signal: signal ?? null,
        reason,
        message,
        createdAt,
        health: health ?? null,
      },
    });

    if (isStale) {
      this.logger.debug('ContainerEventProcessor: skipping stale event update', {
        dockerId: this.shortId(dockerId),
        eventType,
        createdAt: createdAtIso,
        lastEventAt: lastEventAtValue,
      });
      return;
    }

    if (eventType === 'oom') {
      this.recordOom(dockerId, eventTimeMs);
    } else if (eventType === 'die') {
      this.lastOomByContainer.delete(dockerId);
    }

    const updateData: Prisma.ContainerUncheckedUpdateInput = {};
    let statusApplied = false;

    const nextStatus = statusForEvent(eventType, reason);
    if (nextStatus) {
      const canTransition = !(
        (nextStatus === 'terminating' && container.status !== 'running' && container.status !== 'terminating')
        || (nextStatus === 'stopped' && container.status === 'failed' && eventType === 'stop')
      );
      if (canTransition) {
        updateData.status = nextStatus;
        statusApplied = true;
      }
    }

    if (eventType === 'create' || eventType === 'start' || eventType === 'restart') {
      updateData.terminationReason = null;
    } else if (
      eventType === 'kill'
      || eventType === 'die'
      || eventType === 'oom'
      || (eventType === 'stop' && statusApplied)
    ) {
      updateData.terminationReason = reason;
    }

    if (!container.dockerContainerId || container.dockerContainerId !== dockerId) {
      updateData.dockerContainerId = dockerId;
    }
    if (threadId && container.threadId !== threadId) {
      updateData.threadId = threadId;
    }

    let metadataChanged = false;
    if (metadata.lastEventAt !== createdAtIso) {
      metadata.lastEventAt = createdAtIso;
      metadataChanged = true;
    }
    if (eventType === 'destroy' && autoRemoved && metadata.autoRemoved !== true) {
      metadata.autoRemoved = true;
      metadataChanged = true;
    }
    if (eventType === 'health_status' && health && metadata.health !== health) {
      metadata.health = health;
      metadataChanged = true;
    }

    if (metadataChanged) {
      updateData.metadata = metadata as unknown as Prisma.InputJsonValue;
    }

    if (Object.keys(updateData).length > 0) {
      try {
        await this.prisma.container.update({ where: { id: container.id }, data: updateData });
      } catch (err) {
        this.logger.error('ContainerEventProcessor: failed to update container status', {
          dockerId: this.shortId(dockerId),
          eventType,
          reason,
          error: err,
        });
      }
    }

    this.logger.log('ContainerEventProcessor: recorded container event', {
      dockerId: this.shortId(dockerId),
      eventType,
      reason,
      exitCode,
      signal,
      health,
      createdAt: createdAtIso,
    });
  }

  private buildMessage(
    event: DockerEventMessage,
    attributes: Record<string, string>,
    exitCode: number | null,
    signal?: string,
    health?: ContainerHealthStatus,
  ): string | null {
    if (attributes.error) return attributes.error;
    if (attributes['error']) return attributes['error'];
    if (event.status) return event.status;
    if (event.Action) return event.Action;
    if (typeof exitCode === 'number') return `exitCode=${exitCode}`;
    if (signal) return `signal=${signal}`;
    if (health) return `health=${health}`;
    return null;
  }

  private parseExitCode(attrs: Record<string, string>): number | null {
    const candidate = attrs.exitCode ?? attrs.ExitCode;
    if (typeof candidate !== 'string') return null;
    const parsed = Number.parseInt(candidate, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseSignal(attrs: Record<string, string>): string | undefined {
    const candidate = attrs.signal ?? attrs.Signal;
    if (!candidate) return undefined;
    return candidate;
  }

  private hasRecentOom(containerId: string, eventTimeMs: number): boolean {
    const last = this.lastOomByContainer.get(containerId);
    if (typeof last !== 'number') return false;
    return eventTimeMs - last <= RECENT_OOM_WINDOW_MS;
  }

  private recordOom(containerId: string, timestampMs: number): void {
    this.lastOomByContainer.set(containerId, timestampMs);
  }

  private eventTimestampMs(event: DockerEventMessage): number {
    if (typeof event.timeNano === 'number' && event.timeNano > 0) {
      return Math.floor(event.timeNano / 1_000_000);
    }
    if (typeof event.time === 'number' && event.time > 0) {
      return Math.floor(event.time * 1000);
    }
    return Date.now();
  }

  private resolveEventType(event: DockerEventMessage): ContainerEventType | null {
    const action = (event.Action ?? '').toLowerCase();
    if (action && ACTION_TO_EVENT_TYPE[action]) {
      return ACTION_TO_EVENT_TYPE[action];
    }
    const status = (event.status ?? '').toLowerCase();
    if (!status) return null;
    const prefix = status.includes(':') ? status.slice(0, status.indexOf(':')).trim() : status.trim();
    return ACTION_TO_EVENT_TYPE[prefix] ?? null;
  }

  private cloneMetadata(meta: unknown): Record<string, unknown> {
    if (meta && typeof meta === 'object') {
      try {
        return JSON.parse(JSON.stringify(meta));
      } catch {
        return {};
      }
    }
    return {};
  }

  private parseHealthStatus(attrs: Record<string, string>, event: DockerEventMessage): ContainerHealthStatus | undefined {
    const direct = attrs.health_status ?? attrs.Health_status ?? attrs.healthStatus;
    const normalizedDirect = this.normalizeHealthString(direct);
    if (normalizedDirect) return normalizedDirect;
    if (typeof event.status === 'string') {
      const [, candidate] = event.status.split(':');
      const normalizedStatus = this.normalizeHealthString(candidate);
      if (normalizedStatus) return normalizedStatus;
    }
    return undefined;
  }

  private parseAutoRemoved(attrs: Record<string, string>): boolean {
    const candidate = attrs.autoRemove ?? attrs.AutoRemove ?? attrs.autoremove ?? attrs['auto_remove'];
    if (typeof candidate !== 'string') return false;
    const value = candidate.trim().toLowerCase();
    return value === '1' || value === 'true' || value === 'yes';
  }

  private normalizeHealthString(value?: string | null): ContainerHealthStatus | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'healthy') return 'healthy';
    if (normalized === 'unhealthy') return 'unhealthy';
    if (normalized === 'starting') return 'starting';
    return undefined;
  }

  private resolveThreadId(
    storedThreadId: string | null,
    attributes: Record<string, string>,
  ): string | null {
    if (storedThreadId && validateUuid(storedThreadId)) return storedThreadId;
    const candidate = attributes['hautech.ai/thread_id'];
    if (candidate && validateUuid(candidate)) return candidate;
    return null;
  }

  private shortId(id: string): string {
    return id.length > 12 ? id.slice(0, 12) : id;
  }
}
