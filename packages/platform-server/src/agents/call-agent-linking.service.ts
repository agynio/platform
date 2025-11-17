import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, PrismaClient, RunStatus } from '@prisma/client';

import { LoggerService } from '../core/services/logger.service';
import { PrismaService } from '../core/services/prisma.service';
import { RunEventsService } from '../events/run-events.service';

type Tx = PrismaClient | Prisma.TransactionClient;

const CALL_AGENT_TOOL_NAMES = ['call_agent', 'call_engineer'] as const;
type CallAgentToolName = (typeof CALL_AGENT_TOOL_NAMES)[number];

export type CallAgentChildRunStatus = 'queued' | RunStatus;

export interface CallAgentChildRunLink {
  id: string | null;
  status: CallAgentChildRunStatus;
  linkEnabled: boolean;
  latestMessageId: string | null;
}

export interface CallAgentLinkMetadata {
  tool: CallAgentToolName;
  parentThreadId: string;
  childThreadId: string;
  childRun: CallAgentChildRunLink;
  // Legacy flattened fields kept for backwards compatibility
  childRunId?: string | null;
  childRunStatus?: string;
  childRunLinkEnabled?: boolean;
  childMessageId?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class CallAgentLinkingService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  buildInitialMetadata(params: { toolName: string; parentThreadId: string; childThreadId: string }): CallAgentLinkMetadata {
    const canonical: CallAgentToolName = params.toolName === 'call_engineer' ? 'call_engineer' : 'call_agent';
    const childRun: CallAgentChildRunLink = {
      id: null,
      status: 'queued',
      linkEnabled: false,
      latestMessageId: null,
    };
    return {
      tool: canonical,
      parentThreadId: params.parentThreadId,
      childThreadId: params.childThreadId,
      childRun,
      childRunId: childRun.id,
      childRunStatus: childRun.status,
      childRunLinkEnabled: childRun.linkEnabled,
      childMessageId: childRun.latestMessageId,
    };
  }

  async onChildRunStarted(params: {
    tx?: Tx;
    childThreadId: string;
    runId: string;
    latestMessageId: string | null;
  }): Promise<string | null> {
    const tx = params.tx ?? this.prisma;
    const event = await this.findParentEventByChildThread(tx, params.childThreadId);
    if (!event) return null;

    const current = this.parseMetadata(event.metadata);
    if (!current) return null;

    const childRun: CallAgentChildRunLink = {
      id: params.runId,
      status: 'running',
      linkEnabled: true,
      latestMessageId: params.latestMessageId,
    };

    const metadata: CallAgentLinkMetadata = {
      ...current,
      childRun,
      childRunId: childRun.id,
      childRunStatus: childRun.status,
      childRunLinkEnabled: childRun.linkEnabled,
      childMessageId: childRun.latestMessageId,
    };

    await this.patchMetadata(tx, event.id, metadata);
    return event.id;
  }

  async onChildRunMessage(params: { tx?: Tx; runId: string; latestMessageId: string | null }): Promise<string | null> {
    const tx = params.tx ?? this.prisma;
    const event = await this.findParentEventByRun(tx, params.runId);
    if (!event) return null;

    const current = this.parseMetadata(event.metadata);
    if (!current) return null;

    const childRun: CallAgentChildRunLink = {
      id: current.childRun.id ?? params.runId,
      status: current.childRun.status,
      linkEnabled: current.childRun.linkEnabled || Boolean(params.runId),
      latestMessageId: params.latestMessageId ?? current.childRun.latestMessageId ?? null,
    };

    const metadata: CallAgentLinkMetadata = {
      ...current,
      childRun,
      childRunId: childRun.id,
      childRunStatus: childRun.status,
      childRunLinkEnabled: childRun.linkEnabled,
      childMessageId: childRun.latestMessageId,
    };

    await this.patchMetadata(tx, event.id, metadata);
    return event.id;
  }

  async onChildRunCompleted(params: { tx?: Tx; runId: string; status: RunStatus }): Promise<string | null> {
    const tx = params.tx ?? this.prisma;
    const event = await this.findParentEventByRun(tx, params.runId);
    if (!event) return null;

    const current = this.parseMetadata(event.metadata);
    if (!current) return null;

    const childRun: CallAgentChildRunLink = {
      id: current.childRun.id ?? params.runId,
      status: params.status,
      linkEnabled: true,
      latestMessageId: current.childRun.latestMessageId ?? null,
    };

    const metadata: CallAgentLinkMetadata = {
      ...current,
      childRun,
      childRunId: childRun.id,
      childRunStatus: childRun.status,
      childRunLinkEnabled: childRun.linkEnabled,
      childMessageId: childRun.latestMessageId,
    };

    await this.patchMetadata(tx, event.id, metadata);
    return event.id;
  }

  private async patchMetadata(tx: Tx, eventId: string, metadata: CallAgentLinkMetadata): Promise<void> {
    try {
      await this.runEvents.patchEventMetadata({
        tx,
        eventId,
        patch: {
          tool: metadata.tool,
          parentThreadId: metadata.parentThreadId,
          childThreadId: metadata.childThreadId,
          childRun: metadata.childRun,
          childRunId: metadata.childRunId ?? null,
          childRunStatus: metadata.childRunStatus ?? null,
          childRunLinkEnabled: metadata.childRunLinkEnabled ?? false,
          childMessageId: metadata.childMessageId ?? null,
        },
      });
    } catch (err) {
      this.logger.warn('call_agent_linking: failed to patch metadata', { eventId, err });
    }
  }

  private parseMetadata(raw: Prisma.JsonValue | null): CallAgentLinkMetadata | null {
    if (!isRecord(raw)) return null;
    const toolRaw = typeof raw.tool === 'string' ? raw.tool : 'call_agent';
    const tool: CallAgentToolName = toolRaw === 'call_engineer' ? 'call_engineer' : 'call_agent';
    const parentThreadId = typeof raw.parentThreadId === 'string' ? raw.parentThreadId : null;
    const childThreadId = typeof raw.childThreadId === 'string' ? raw.childThreadId : null;
    if (!parentThreadId || !childThreadId) return null;

    const childRun: CallAgentChildRunLink = {
      id: null,
      status: 'queued',
      linkEnabled: false,
      latestMessageId: null,
    };

    if (isRecord(raw.childRun)) {
      if (typeof raw.childRun.id === 'string') childRun.id = raw.childRun.id;
      if (typeof raw.childRun.status === 'string') childRun.status = raw.childRun.status as CallAgentChildRunStatus;
      if (typeof raw.childRun.linkEnabled === 'boolean') childRun.linkEnabled = raw.childRun.linkEnabled;
      if (typeof raw.childRun.latestMessageId === 'string') childRun.latestMessageId = raw.childRun.latestMessageId;
    }

    if (typeof raw.childRunId === 'string' && !childRun.id) childRun.id = raw.childRunId;
    if (typeof raw.childRunStatus === 'string') childRun.status = raw.childRunStatus as CallAgentChildRunStatus;
    if (raw.childRunLinkEnabled === true) childRun.linkEnabled = true;
    if (typeof raw.childMessageId === 'string') childRun.latestMessageId = raw.childMessageId;

    return {
      tool,
      parentThreadId,
      childThreadId,
      childRun,
      childRunId: childRun.id,
      childRunStatus: childRun.status,
      childRunLinkEnabled: childRun.linkEnabled,
      childMessageId: childRun.latestMessageId,
    };
  }

  private async findParentEventByChildThread(tx: Tx, childThreadId: string) {
    return tx.runEvent.findFirst({
      where: {
        type: 'tool_execution',
        sourceSpanId: childThreadId,
        toolExecution: { toolName: { in: CALL_AGENT_TOOL_NAMES } },
      },
      orderBy: { ts: 'desc' },
      select: { id: true, metadata: true },
    });
  }

  private async findParentEventByRun(tx: Tx, runId: string) {
    return tx.runEvent.findFirst({
      where: {
        type: 'tool_execution',
        toolExecution: { toolName: { in: CALL_AGENT_TOOL_NAMES } },
        metadata: { path: ['childRunId'], equals: runId },
      },
      orderBy: { ts: 'desc' },
      select: { id: true, metadata: true },
    });
  }
}
