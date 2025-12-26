import z from 'zod';

import { FunctionTool, HumanMessage, ResponseMessage, ToolCallOutputMessage } from '@agyn/llm';
import { ManageToolNode } from './manage.node';
import { Logger } from '@nestjs/common';
import { LLMContext } from '../../../llm/types';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import type { ErrorResponse } from '../../../utils/error-response';
import { normalizeError } from '../../../utils/error-response';
import { CallAgentLinkingService } from '../../../agents/call-agent-linking.service';
import { renderMustache } from '../../../prompt/mustache.template';

export const ManageInvocationSchema = z
  .object({
    command: z.enum(['send_message', 'check_status']).describe('Command to execute.'),
    worker: z.string().min(1).optional().describe('Target worker name (required for send_message).'),
    message: z.string().min(1).optional().describe('Message to send (required for send_message).'),
    threadAlias: z
      .string()
      .min(1)
      .optional()
      .describe('Optional child thread alias; defaults to worker name.'),
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
    const template = this.node.config?.prompt;
    if (typeof template === 'string' && template.trim().length > 0) {
      const context = this.node.getAgentPromptContext();
      return renderMustache(template, context);
    }
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

  private verifyChildAutoResponseEnabled(
    candidate: unknown,
    context: { workerName: string; childThreadId: string },
  ): void {
    try {
      const config = (candidate as { config?: { sendFinalResponseToThread?: boolean } } | null)?.config;
      const autoSend =
        typeof config?.sendFinalResponseToThread === 'boolean' ? config.sendFinalResponseToThread : true;
      if (!autoSend) {
        this.logger.warn(
          `Manage: sync send_message invoked on worker without auto-response${this.format({
            workerName: context.workerName,
            childThreadId: context.childThreadId,
          })}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(
        `Manage: unable to verify child auto-response${this.format({
          workerName: context.workerName,
          childThreadId: context.childThreadId,
          error: message,
        })}`,
      );
    }
  }

  async execute(args: ManageInvocationArgs, ctx: LLMContext): Promise<ManageInvocationSuccess> {
    const { command, worker, message, threadAlias } = args;
    const parentThreadId = ctx.threadId;
    if (!parentThreadId) throw new Error('Manage: missing threadId in LLM context');
    const workerNames = this.node.listWorkers();
    if (command === 'send_message') {
      if (!workerNames.length) throw new Error('No agents connected');
      const workerHandle = worker?.trim();
      if (!workerHandle) throw new Error('worker is required for send_message');
      const messageText = message?.trim() ?? '';
      if (!messageText) throw new Error('message is required for send_message');
      const targetAgent = this.node.getWorkerByName(workerHandle);
      if (!targetAgent) throw new Error(`Unknown worker: ${workerHandle}`);
      const resolvedName = this.node.getWorkerName(targetAgent);
      const persistence = this.getPersistence();
      const callerAgent = ctx.callerAgent;
      if (!callerAgent || typeof callerAgent.invoke !== 'function') {
        throw new Error('Manage: caller agent unavailable');
      }
      const providedAlias = typeof threadAlias === 'string' ? threadAlias.trim() : undefined;
      if (typeof threadAlias === 'string' && !providedAlias) {
        throw new Error('Manage: invalid or empty threadAlias');
      }
      let aliasUsed = providedAlias ?? this.sanitizeAlias(resolvedName);
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
      let childThreadId: string | undefined;
      try {
        childThreadId = await persistence.getOrCreateSubthreadByAlias('manage', aliasUsed, parentThreadId, '');
      } catch (primaryError) {
        if (fallbackAlias && fallbackAlias !== aliasUsed) {
          aliasUsed = fallbackAlias;
          childThreadId = await persistence.getOrCreateSubthreadByAlias('manage', aliasUsed, parentThreadId, '');
          this.logger.warn(
            `Manage: provided threadAlias invalid, using sanitized fallback${this.format({
              workerName: resolvedName,
              parentThreadId,
              providedAlias,
              fallbackAlias: aliasUsed,
            })}`,
          );
        } else {
          throw primaryError;
        }
      }
      if (!childThreadId) {
        throw new Error('Manage: failed to create child thread');
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
      let invocationPromise: Promise<InvocationOutcome> | undefined;
      let invocationIsPromise = false;
      try {
        await this.node.registerInvocation({
          childThreadId,
          parentThreadId,
          workerName: resolvedName,
          callerAgent,
        });
        if (mode === 'sync') {
          waitPromise = this.node.awaitChildResponse(childThreadId, timeoutMs);
        }
        if (mode === 'sync' && !waitPromise) {
          throw new Error('Manage: missing waiter in sync mode');
        }

        const invocationResult: InvocationResult = targetAgent.invoke(childThreadId, [HumanMessage.fromText(messageText)]);
        const normalizedInvocation = this.toInvocationPromise(invocationResult);
        invocationPromise = normalizedInvocation.promise;
        invocationIsPromise = normalizedInvocation.isPromise;

        if (mode === 'sync') {
          invocationPromise?.catch((err) => {
            this.logError('Manage: sync send_message invoke failed', { workerName: resolvedName, childThreadId }, err);
          });
          this.verifyChildAutoResponseEnabled(targetAgent, {
            workerName: resolvedName,
            childThreadId,
          });
          const responseText = await waitPromise!;
          return this.node.renderWorkerResponse(resolvedName, responseText);
        }

        if (!invocationIsPromise) {
          const resultType = invocationResult === null ? 'null' : typeof invocationResult;
          this.logger.error(
            `Manage: async send_message invoke returned non-promise${this.format({
              workerName: resolvedName,
              childThreadId,
              resultType,
              promiseLike: invocationIsPromise,
            })}`,
          );
        }

        invocationPromise?.catch((err) => {
          this.logError('Manage: async send_message failed', { workerName: resolvedName, childThreadId }, err);
        });

        return this.node.renderAsyncAcknowledgement(resolvedName);
      } catch (err: unknown) {
        this.logError('Manage: send_message failed', { workerName: resolvedName, childThreadId }, err);
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
