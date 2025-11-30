import { HumanMessage } from '@agyn/llm';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { LiveGraphRuntime } from '../../graph-core/liveGraph.manager';
import { AgentNode } from '../../nodes/agent/agent.node';
import type { SendResult } from '../types';
import { ThreadsQueryService } from '../../threads/threads.query.service';

interface AgentIngressPayload {
  parentThreadId: string;
  text: string;
  childThreadId: string;
  childThreadAlias?: string;
  agentTitle: string;
  runId: string | null;
  showCorrelationInOutput?: boolean;
}

@Injectable()
export class AgentIngressService {
  private readonly logger = new Logger(AgentIngressService.name);

  constructor(
    @Inject(ThreadsQueryService)
    private readonly threadsQuery: ThreadsQueryService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
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

  async enqueueToAgent(payload: AgentIngressPayload): Promise<SendResult> {
    const text = payload.text ?? '';
    if (text.trim().length === 0) {
      return { ok: false, error: 'empty_message' } satisfies SendResult;
    }

    try {
      const agentNodeId = await this.threadsQuery.getThreadAgentNodeId(payload.parentThreadId);
      if (!agentNodeId) {
        this.logger.warn(
          `AgentIngressService: missing agent node${this.format({
            parentThreadId: payload.parentThreadId,
            childThreadId: payload.childThreadId,
            agentTitle: payload.agentTitle,
          })}`,
        );
        return { ok: false, error: 'agent_node_not_found' } satisfies SendResult;
      }

      const node = this.runtime.getNodeInstance(agentNodeId);
      if (!node || !(node instanceof AgentNode)) {
        this.logger.warn(
          `AgentIngressService: node unavailable${this.format({
            parentThreadId: payload.parentThreadId,
            childThreadId: payload.childThreadId,
            agentNodeId,
          })}`,
        );
        return { ok: false, error: 'agent_node_unavailable' } satisfies SendResult;
      }

      if (node.status !== 'ready') {
        this.logger.warn(
          `AgentIngressService: agent not ready${this.format({
            parentThreadId: payload.parentThreadId,
            childThreadId: payload.childThreadId,
            agentNodeId,
            status: node.status,
          })}`,
        );
        return { ok: false, error: 'agent_not_ready' } satisfies SendResult;
      }

      await node.invoke(payload.parentThreadId, [HumanMessage.fromText(text)]);
      return { ok: true } satisfies SendResult;
    } catch (error) {
      this.logger.error(
        `AgentIngressService: enqueue failed${this.format({
          parentThreadId: payload.parentThreadId,
          childThreadId: payload.childThreadId,
          runId: payload.runId,
          agentTitle: payload.agentTitle,
          error: this.errorInfo(error),
        })}`,
      );
      const message = error instanceof Error && error.message ? error.message : 'agent_enqueue_failed';
      return { ok: false, error: message } satisfies SendResult;
    }
  }
}
