import { Inject, Injectable } from '@nestjs/common';
import { type PrismaClient, ContainerEventType, type ContainerStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/services/prisma.service';
import { LoggerService } from '../../core/services/logger.service';
import { ContainerReasonContext, ContainerTerminationReason, mapContainerEventReason, statusForEvent } from './containerEvent.reason';
import { validate as validateUuid } from 'uuid';

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

@Injectable()
export class ContainerEventProcessor {
  private prisma: PrismaClient;
  private queue: Promise<void> = Promise.resolve();
  private lastOomByContainer = new Map<string, number>();

  constructor(
    @Inject(PrismaService) prismaService: PrismaService,
    @Inject(LoggerService) private readonly logger: LoggerService,
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
    const action = (event.Action ?? event.status ?? '').toLowerCase();
    if (action !== 'oom' && action !== 'die' && action !== 'kill') return;
    if (event.Type && event.Type.toLowerCase() !== 'container') return;

    const dockerId = event.id ?? event.Id ?? event.Actor?.ID;
    if (!dockerId) {
      this.logger.warn('ContainerEventProcessor: event missing container id', { event });
      return;
    }

    const attributes = event.Actor?.Attributes ?? {};
    const exitCode = this.parseExitCode(attributes);
    const signal = this.parseSignal(attributes);
    const eventType = action as ContainerEventType;
    const eventTimeMs = this.eventTimestampMs(event);
    const hadRecentOom = this.hasRecentOom(dockerId, eventTimeMs);

    const container = await this.prisma.container.findFirst({
      where: {
        OR: [
          { dockerContainerId: dockerId },
          { containerId: dockerId },
        ],
      },
      select: { id: true, threadId: true, status: true, dockerContainerId: true },
    });

    if (!container) {
      this.logger.warn('ContainerEventProcessor: container not found for event', {
        dockerId: this.shortId(dockerId),
        eventType,
      });
      if (eventType === 'oom') this.recordOom(dockerId, eventTimeMs);
      return;
    }

    const threadId = this.resolveThreadId(container.threadId, attributes);

    const reasonContext: ContainerReasonContext = {
      eventType,
      exitCode,
      signal,
      hadRecentOom,
    };
    const reason: ContainerTerminationReason = mapContainerEventReason(reasonContext);
    const createdAt = new Date(eventTimeMs);
    const message = this.buildMessage(event, attributes, exitCode, signal);

    await this.prisma.containerEvent.create({
      data: {
        containerDbId: container.id,
        eventType,
        exitCode: typeof exitCode === 'number' ? exitCode : null,
        signal: signal ?? null,
        reason,
        message,
        createdAt,
      },
    });

    if (eventType === 'oom') {
      this.recordOom(dockerId, eventTimeMs);
    } else if (eventType === 'die') {
      this.lastOomByContainer.delete(dockerId);
    }

    const update = this.buildContainerUpdate(container.status, eventType, reason);
    const updateData: Prisma.ContainerUncheckedUpdateInput = {
      ...(update as Prisma.ContainerUncheckedUpdateInput | undefined ?? {}),
    };

    if (!container.dockerContainerId || container.dockerContainerId !== dockerId) {
      updateData.dockerContainerId = dockerId;
    }
    if (threadId && container.threadId !== threadId) {
      updateData.threadId = threadId;
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

    this.logger.info('ContainerEventProcessor: recorded container event', {
      dockerId: this.shortId(dockerId),
      eventType,
      reason,
      exitCode,
      signal,
      createdAt: createdAt.toISOString(),
    });
  }

  private buildContainerUpdate(
    currentStatus: ContainerStatus,
    eventType: ContainerEventType,
    reason: ContainerTerminationReason,
  ): Prisma.ContainerUpdateInput | undefined {
    const status = statusForEvent(eventType, reason);
    const data: Prisma.ContainerUpdateInput = {
      terminationReason: reason,
    };

    if (status) {
      if (status === 'terminating' && currentStatus !== 'running' && currentStatus !== 'terminating') {
        // Skip status regression for containers already marked terminal
      } else {
        data.status = status;
      }
    }

    return data;
  }

  private buildMessage(
    event: DockerEventMessage,
    attributes: Record<string, string>,
    exitCode: number | null,
    signal?: string,
  ): string | null {
    if (attributes.error) return attributes.error;
    if (attributes['error']) return attributes['error'];
    if (event.status) return event.status;
    if (event.Action) return event.Action;
    if (typeof exitCode === 'number') return `exitCode=${exitCode}`;
    if (signal) return `signal=${signal}`;
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
