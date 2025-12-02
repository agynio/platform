import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/services/prisma.service';
import { ThreadsQueryService } from '../../threads/threads.query.service';
import { ManageChannelDescriptorSchema, type ThreadOutboxSource } from '../types';

interface ComputeForwardingInfoParams {
  childThreadId: string;
  text: string;
  source: ThreadOutboxSource;
  runId?: string | null;
  prefix?: string;
}

interface ComputeForwardingInfoSuccess {
  ok: true;
  parentThreadId: string;
  forwardedText: string;
  agentTitle: string;
  childThreadId: string;
  childThreadAlias?: string | null;
  runId: string | null;
  showCorrelationInOutput: boolean;
}

interface ComputeForwardingInfoFailure {
  ok: false;
  error: string;
}

@Injectable()
export class ManageAdapter {
  private readonly logger = new Logger(ManageAdapter.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ThreadsQueryService) private readonly threadsQuery: ThreadsQueryService,
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

  async computeForwardingInfo(params: ComputeForwardingInfoParams): Promise<ComputeForwardingInfoSuccess | ComputeForwardingInfoFailure> {
    const { childThreadId, source, runId = null } = params;
    const text = params.text?.trim() ?? '';
    if (!text) {
      return { ok: false, error: 'empty_message' } satisfies ComputeForwardingInfoFailure;
    }

    try {
      let parentThreadId: string | null = this.asStringOrNull(params.parentThreadId);
      let childThreadAlias: string | null =
        params.childThreadAlias === undefined ? null : this.asStringOrNull(params.childThreadAlias);
      if (!parentThreadId || childThreadAlias === null) {
        const link = await this.threadsQuery.getParentThreadIdAndAlias(childThreadId);
        if (!parentThreadId) parentThreadId = this.asStringOrNull(link.parentThreadId);
        if (childThreadAlias === null) childThreadAlias = this.asStringOrNull(link.alias);
      }

      const thread = await this.prisma.getClient().thread.findUnique({
        where: { id: childThreadId },
        select: { channel: true },
      });

      if (!parentThreadId) {
        this.logger.warn(
          `ManageAdapter: missing parent thread${this.format({ childThreadId })}`,
        );
        return { ok: false, error: 'manage_missing_parent' } satisfies ComputeForwardingInfoFailure;
      }

      const ensuredParentThreadId: string = parentThreadId;

      const descriptorInfo = this.parseDescriptor(thread?.channel);
      const agentTitleCandidate =
        descriptorInfo?.agentTitle ?? (await this.threadsQuery.getThreadAgentTitle(childThreadId));
      const trimmedAgentTitle = typeof agentTitleCandidate === 'string' ? agentTitleCandidate.trim() : '';
      const agentTitle = trimmedAgentTitle.length > 0 ? trimmedAgentTitle : 'Subagent';
      const resolvedPrefix = this.resolvePrefix(
        typeof params.prefix === 'string' && params.prefix.length > 0 ? params.prefix : descriptorInfo?.asyncPrefix,
        agentTitle,
      );
      const alias = this.extractAlias(childThreadAlias);
      const correlationLabel = descriptorInfo?.showCorrelationInOutput ? this.buildCorrelationLabel({ alias, childThreadId }) : null;
      const forwardedText = this.composeForwardedText(resolvedPrefix, correlationLabel, text);

      return {
        ok: true,
        parentThreadId: ensuredParentThreadId,
        forwardedText,
        agentTitle,
        childThreadId,
        childThreadAlias: alias,
        runId,
        showCorrelationInOutput: descriptorInfo?.showCorrelationInOutput ?? false,
      } satisfies ComputeForwardingInfoSuccess;
    } catch (error) {
      this.logger.error(
        `ManageAdapter: computeForwardingInfo failed${this.format({
          childThreadId: params.childThreadId,
          source,
          runId,
          error: this.errorInfo(error),
        })}`,
      );
      const message = error instanceof Error && error.message ? error.message : 'manage_forward_failed';
      return { ok: false, error: message } satisfies ComputeForwardingInfoFailure;
    }
  }

  private parseDescriptor(
    raw: unknown,
  ): { asyncPrefix?: string; showCorrelationInOutput?: boolean; agentTitle?: string } | null {
    if (!raw) return null;
    const parsed = ManageChannelDescriptorSchema.safeParse(raw);
    if (!parsed.success) return null;
    const meta = parsed.data.meta ?? {};
    return {
      asyncPrefix: typeof meta.asyncPrefix === 'string' ? meta.asyncPrefix : undefined,
      showCorrelationInOutput: meta.showCorrelationInOutput === true,
      agentTitle: typeof meta.agentTitle === 'string' ? meta.agentTitle : undefined,
    };
  }

  private resolvePrefix(raw: string | undefined, agentTitle: string): string {
    const base = typeof raw === 'string' && raw.length > 0 ? raw : `From ${agentTitle}: `;
    return base.replace(/{{\s*agentTitle\s*}}/gi, agentTitle);
  }

  private extractAlias(alias: unknown): string | null {
    if (typeof alias !== 'string' || alias.length === 0) return null;
    const lastSegment = alias.split(':').pop();
    return (lastSegment ?? alias) || null;
  }

  private asStringOrNull(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private buildCorrelationLabel(context: { alias: string | null; childThreadId: string }): string {
    const parts: string[] = [];
    if (context.alias) parts.push(`alias=${context.alias}`);
    parts.push(`thread=${context.childThreadId}`);
    return `[${parts.join('; ')}]`;
  }

  private composeForwardedText(prefix: string, correlation: string | null, text: string): string {
    const correlationSegment = correlation ? `${correlation} ` : '';
    if (!prefix) return `${correlationSegment}${text}`.trimStart();
    return `${prefix}${correlationSegment}${text}`;
  }
}
