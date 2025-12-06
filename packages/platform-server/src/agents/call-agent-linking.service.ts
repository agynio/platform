import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, PrismaClient, RunStatus } from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';

import { PrismaService } from '../core/services/prisma.service';
import { RunEventsService } from '../events/run-events.service';
import { EventsBusService } from '../events/events-bus.service';

type Tx = PrismaClient | Prisma.TransactionClient;

type CanonicalToolName = 'call_agent' | 'call_engineer' | 'manage';
const TOOL_NAME_ALIASES: Record<CanonicalToolName, string[]> = {
  call_agent: ['call_agent'],
  call_engineer: ['call_engineer'],
  manage: ['manage', 'manage_agent'],
};
const LINKABLE_TOOL_NAMES: string[] = ['call_agent', 'call_engineer', 'manage', 'manage_agent'];

export type CallAgentChildRunStatus = 'queued' | RunStatus;

export interface CallAgentChildRunLink {
  id: string | null;
  status: CallAgentChildRunStatus;
  linkEnabled: boolean;
  latestMessageId: string | null;
}

export interface CallAgentLinkMetadata {
  tool: CanonicalToolName;
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
  private readonly logger = new Logger(CallAgentLinkingService.name);
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(RunEventsService) private readonly runEvents: RunEventsService,
    @Inject(EventsBusService) private readonly eventsBus: EventsBusService,
  ) {}

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private errorInfo(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return { message: String(error) };
  }

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  private canonicalizeToolName(toolName: string): CanonicalToolName | null {
    if (toolName === 'call_agent') return 'call_agent';
    if (toolName === 'call_engineer') return 'call_engineer';
    if (toolName === 'manage' || toolName === 'manage_agent') return 'manage';
    return null;
  }

  private toolSearchNames(tool: CanonicalToolName): string[] {
    return TOOL_NAME_ALIASES[tool];
  }

  buildInitialMetadata(params: { tool: CanonicalToolName; parentThreadId: string; childThreadId: string }): CallAgentLinkMetadata {
    const childRun: CallAgentChildRunLink = {
      id: null,
      status: 'queued',
      linkEnabled: false,
      latestMessageId: null,
    };
    return {
      tool: params.tool,
      parentThreadId: params.parentThreadId,
      childThreadId: params.childThreadId,
      childRun,
      childRunId: childRun.id,
      childRunStatus: childRun.status,
      childRunLinkEnabled: childRun.linkEnabled,
      childMessageId: childRun.latestMessageId,
    };
  }

  async registerParentToolExecution(params: {
    runId: string;
    parentThreadId: string;
    childThreadId: string;
    toolName: string;
  }): Promise<string | null> {
    const canonical = this.canonicalizeToolName(params.toolName);
    if (!canonical) return null;
    const toolNames = this.toolSearchNames(canonical);
    try {
      const eventId = await this.prisma.$transaction(async (tx) => {
        const event = await this.findLatestToolEvent(tx, params.runId, toolNames);
        if (!event) return null;

        const metadata = this.buildInitialMetadata({
          tool: canonical,
          parentThreadId: params.parentThreadId,
          childThreadId: params.childThreadId,
        });

        await this.saveMetadata(tx, event.id, metadata);
        return event.id;
      });
      if (eventId) await this.eventsBus.publishEvent(eventId, 'update');
      return eventId;
    } catch (err) {
      this.logger.warn(
        `call_agent_linking: failed to register parent tool execution${this.format({
          runId: params.runId,
          childThreadId: params.childThreadId,
          tool: canonical,
          error: this.errorInfo(err),
        })}`,
      );
      return null;
    }
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

    await this.saveMetadata(tx, event.id, metadata);
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

    await this.saveMetadata(tx, event.id, metadata);
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

    await this.saveMetadata(tx, event.id, metadata);
    return event.id;
  }

  async resolveLinkedAgentNodes(threadIds: string[]): Promise<Record<string, string>> {
    if (!Array.isArray(threadIds) || threadIds.length === 0) {
      return {};
    }
    const clauses = threadIds
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .map((id) => ({ metadata: { path: ['childThreadId'], equals: id } }));
    if (clauses.length === 0) {
      return {};
    }
    try {
      const events = await this.prisma.runEvent.findMany({
        where: {
          type: 'tool_execution',
          toolExecution: { toolName: { in: LINKABLE_TOOL_NAMES } },
          OR: clauses,
        },
        orderBy: { ts: 'desc' },
        select: { metadata: true, nodeId: true },
      });
      const resolved: Record<string, string> = {};
      for (const event of events) {
        const parsed = this.parseMetadata(event.metadata);
        if (!parsed?.childThreadId) continue;
        if (resolved[parsed.childThreadId]) continue;
        const nodeId = typeof event.nodeId === 'string' ? event.nodeId : null;
        if (nodeId && nodeId.length > 0) {
          resolved[parsed.childThreadId] = nodeId;
        }
      }
      return resolved;
    } catch (err) {
      this.logger.warn(
        `call_agent_linking: failed to resolve linked agents${this.format({
          threadIds,
          error: this.errorInfo(err),
        })}`,
      );
      return {};
    }
  }

  private serializeMetadata(metadata: CallAgentLinkMetadata): PrismaNamespace.JsonObject {
    return {
      tool: metadata.tool,
      parentThreadId: metadata.parentThreadId,
      childThreadId: metadata.childThreadId,
      childRun: {
        id: metadata.childRun.id,
        status: metadata.childRun.status,
        linkEnabled: metadata.childRun.linkEnabled,
        latestMessageId: metadata.childRun.latestMessageId,
      },
      childRunId: metadata.childRunId ?? metadata.childRun.id ?? null,
      childRunStatus: metadata.childRunStatus ?? metadata.childRun.status,
      childRunLinkEnabled: metadata.childRunLinkEnabled ?? metadata.childRun.linkEnabled,
      childMessageId: metadata.childMessageId ?? metadata.childRun.latestMessageId ?? null,
    } satisfies PrismaNamespace.JsonObject;
  }

  private async saveMetadata(tx: Tx, eventId: string, metadata: CallAgentLinkMetadata): Promise<void> {
    try {
      await tx.runEvent.update({ where: { id: eventId }, data: { metadata: this.serializeMetadata(metadata) } });
    } catch (err) {
      this.logger.warn(
        `call_agent_linking: failed to save metadata${this.format({ eventId, error: this.errorInfo(err) })}`,
      );
    }
  }

  private parseMetadata(raw: Prisma.JsonValue | null): CallAgentLinkMetadata | null {
    if (!isRecord(raw)) return null;
    const toolRaw = typeof raw.tool === 'string' ? raw.tool : 'call_agent';
    const tool = this.canonicalizeToolName(toolRaw) ?? 'call_agent';
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
        toolExecution: { toolName: { in: LINKABLE_TOOL_NAMES } },
        metadata: { path: ['childThreadId'], equals: childThreadId },
      },
      orderBy: { ts: 'desc' },
      select: { id: true, metadata: true },
    });
  }

  private async findParentEventByRun(tx: Tx, runId: string) {
    return tx.runEvent.findFirst({
      where: {
        type: 'tool_execution',
        toolExecution: { toolName: { in: LINKABLE_TOOL_NAMES } },
        metadata: { path: ['childRunId'], equals: runId },
      },
      orderBy: { ts: 'desc' },
      select: { id: true, metadata: true },
    });
  }

  private async findLatestToolEvent(tx: Tx, runId: string, toolNames: readonly string[]) {
    return tx.runEvent.findFirst({
      where: {
        runId,
        type: 'tool_execution',
        toolExecution: {
          is: {
            toolName: { in: [...toolNames] },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      select: { id: true, metadata: true },
    });
  }
}
