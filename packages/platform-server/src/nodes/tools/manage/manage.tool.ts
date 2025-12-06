import z from 'zod';

import { FunctionTool, HumanMessage, ResponseMessage, ToolCallOutputMessage } from '@agyn/llm';
import { ManageToolNode } from './manage.node';
import { Logger } from '@nestjs/common';
import { LLMContext } from '../../../llm/types';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import type { ErrorResponse } from '../../../utils/error-response';
import { normalizeError } from '../../../utils/error-response';
import { CallAgentLinkingService } from '../../../agents/call-agent-linking.service';

export const ManageInvocationSchema = z
  .object({
    command: z.enum(['send_message', 'check_status']).describe('Command to execute.'),
    worker: z.string().min(1).optional().describe('Target worker name (required for send_message).'),
    message: z.string().min(1).optional().describe('Message to send (required for send_message).'),
    threadAlias: z
      .string()
      .min(1)
      .optional()
      .describe('Optional child thread alias; defaults per worker title.'),
  })
  .strict();

type ManageInvocationArgs = z.infer<typeof ManageInvocationSchema>;
type ManageInvocationSuccess = string;
type InvocationOutcome = ResponseMessage | ToolCallOutputMessage;
type InvocationResult = PromiseLike<InvocationOutcome> | InvocationOutcome;

export class ManageFunctionTool extends FunctionTool<typeof ManageInvocationSchema> {
  private _node?: ManageToolNode;
  private readonly logger = new Logger(ManageFunctionTool.name);

  constructor(
    private readonly persistence: AgentsPersistenceService,
    private readonly linking: CallAgentLinkingService,
  ) {
    super();
  }

  init(node: ManageToolNode) {
    this._node = node;
    return this;
  }

  get node() {
    if (!this._node) throw new Error('ManageFunctionTool: node not initialized');
    return this._node;
  }

  get name() {
    const configured = this.node.config?.name;
    return typeof configured === 'string' && configured.length > 0 ? configured : 'manage';
  }
  get schema() {
    return ManageInvocationSchema;
  }
  get description() {
    const description = this.node.config?.description;
    return typeof description === 'string' && description.length > 0 ? description : 'Manage tool';
  }

  private getPersistence(): AgentsPersistenceService {
    return this.persistence;
  }

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }

  private sanitizeAlias(raw: string | undefined): string {
    const normalized = (raw ?? '').toLowerCase();
    const withHyphen = normalized.replace(/\s+/g, '-');
    const cleaned = withHyphen.replace(/[^a-z0-9._-]/g, '');
    const collapsed = cleaned.replace(/-+/g, '-');
    const truncated = collapsed.slice(0, 64);
    if (!truncated || !/[a-z0-9]/.test(truncated)) {
      throw new Error('Manage: invalid or empty threadAlias');
    }
    return truncated;
  }

  private normalize(err: unknown, options?: { defaultCode?: string; retriable?: boolean }): ErrorResponse {
    return normalizeError(err, options);
  }

  private isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      return false;
    }
    return typeof (value as PromiseLike<T>).then === 'function';
  }

  private toInvocationPromise(result: InvocationResult): { promise: Promise<InvocationOutcome>; isPromise: boolean } {
    const isPromise = this.isPromiseLike<InvocationOutcome>(result);
    const promise = Promise.resolve(result as InvocationOutcome);
    return { promise, isPromise };
  }

  private logError(prefix: string, context: Record<string, unknown>, err: unknown) {
    const normalized = this.normalize(err);
    this.logger.error(`${prefix}${this.format({ ...context, error: normalized })}`);
  }

  async execute(args: ManageInvocationArgs, ctx: LLMContext): Promise<ManageInvocationSuccess> {
    const { command, worker, message, threadAlias } = args;
    const parentThreadId = ctx.threadId;
    if (!parentThreadId) throw new Error('Manage: missing threadId in LLM context');
    const workerTitles = this.node.listWorkers();
    if (command === 'send_message') {
      if (!workerTitles.length) throw new Error('No agents connected');
      const targetTitle = worker?.trim();
      if (!targetTitle) throw new Error('worker is required for send_message');
      const messageText = message?.trim() ?? '';
      if (!messageText) throw new Error('message is required for send_message');
      const targetAgent = this.node.getWorkerByTitle(targetTitle);
      if (!targetAgent) throw new Error(`Unknown worker: ${targetTitle}`);
      const persistence = this.getPersistence();
      const callerAgent = ctx.callerAgent;
      if (!callerAgent || typeof callerAgent.invoke !== 'function') {
        throw new Error('Manage: caller agent unavailable');
      }
      const providedAlias = typeof threadAlias === 'string' ? threadAlias.trim() : undefined;
      if (typeof threadAlias === 'string' && !providedAlias) {
        throw new Error('Manage: invalid or empty threadAlias');
      }
      let aliasUsed = providedAlias ?? this.sanitizeAlias(targetTitle);
      const fallbackAlias =
        providedAlias !== undefined
          ? (() => {
              try {
                return this.sanitizeAlias(providedAlias);
              } catch {
                return null;
              }
            })()
          : null;
      let childThreadId: string;
      try {
        childThreadId = await persistence.getOrCreateSubthreadByAlias('manage', aliasUsed, parentThreadId, '');
      } catch (primaryError) {
        if (fallbackAlias && fallbackAlias !== aliasUsed) {
          aliasUsed = fallbackAlias;
          childThreadId = await persistence.getOrCreateSubthreadByAlias('manage', aliasUsed, parentThreadId, '');
          this.logger.warn(
            `Manage: provided threadAlias invalid, using sanitized fallback${this.format({
              worker: targetTitle,
              parentThreadId,
              providedAlias,
              fallbackAlias: aliasUsed,
            })}`,
          );
        } else {
          throw primaryError;
        }
      }
      await persistence.setThreadChannelNode(childThreadId, this.node.nodeId);
      const runId = typeof ctx.runId === 'string' ? ctx.runId : '';
      if (runId) {
        try {
          await this.linking.registerParentToolExecution({
            runId,
            parentThreadId,
            childThreadId,
            toolName: this.name,
          });
        } catch (err) {
          const errorInfo = err instanceof Error ? { name: err.name, message: err.message } : { message: String(err) };
          this.logger.warn(
            `Manage: failed to register parent tool execution${this.format({
              parentThreadId,
              childThreadId,
              runId,
              error: errorInfo,
            })}`,
          );
        }
      }
      const mode = this.node.getMode();
      const timeoutMs = this.node.getTimeoutMs();
      let waitPromise: Promise<string> | null = null;
      try {
        await this.node.registerInvocation({
          childThreadId,
          parentThreadId,
          workerTitle: targetTitle,
          callerAgent,
        });
        if (mode === 'sync') {
          waitPromise = this.node.awaitChildResponse(childThreadId, timeoutMs);
        }
        const invocationResult: InvocationResult = targetAgent.invoke(childThreadId, [HumanMessage.fromText(messageText)]);
        const { promise: invocationPromise, isPromise } = this.toInvocationPromise(invocationResult);

        if (mode === 'sync') {
          const [responseText] = await Promise.all([waitPromise!, invocationPromise]);
          return this.node.renderWorkerResponse(targetTitle, responseText);
        }

        if (!isPromise) {
          const resultType = invocationResult === null ? 'null' : typeof invocationResult;
          this.logger.error(
            `Manage: async send_message invoke returned non-promise${this.format({
              worker: targetTitle,
              childThreadId,
              resultType,
              promiseLike: isPromise,
            })}`,
          );
        }

        invocationPromise.catch((err) => {
          this.logError('Manage: async send_message failed', { worker: targetTitle, childThreadId }, err);
        });

        return this.node.renderAsyncAcknowledgement(targetTitle);
      } catch (err: unknown) {
        this.logError('Manage: send_message failed', { worker: targetTitle, childThreadId }, err);
        throw err;
      }
    }
    if (command === 'check_status') {
      const workers = this.node.getWorkers();
      if (!workers.length) return JSON.stringify({ activeTasks: 0, childThreadIds: [] });
      const _prefix = `${parentThreadId}__`;
      const ids = new Set<string>();
      const promises = workers.map(async (_agent) => {
        try {
          // const res = await Promise.resolve(w.agent.listActiveThreads(prefix));
          // const threads = Array.isArray(res) ? res : [];
          // for (const t of threads) if (t.startsWith(prefix)) ids.add(t.slice(prefix.length));
        } catch (_err: unknown) {
          // Logger.error('Manage: listActiveThreads failed', {
          //   worker: w.name,
          //   error: (err as { message?: string })?.message || String(err),
          // });
        }
      });
      await Promise.all(promises);
      return JSON.stringify({ activeTasks: ids.size, childThreadIds: Array.from(ids.values()) });
    }
    return '';
  }
}
