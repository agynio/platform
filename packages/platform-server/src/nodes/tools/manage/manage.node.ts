import { Inject, Injectable, Scope } from '@nestjs/common';
import z from 'zod';
import { HumanMessage } from '@agyn/llm';
import { BaseToolNode } from '../baseToolNode';
import { ManageFunctionTool } from './manage.tool';
import {
  AgentNode,
  DEFAULT_SYSTEM_PROMPT,
  createAgentPromptResolutionState,
  type AgentPromptResolutionState,
} from '../../agent/agent.node';
import { AgentsPersistenceService } from '../../../agents/agents.persistence.service';
import { CallAgentLinkingService } from '../../../agents/call-agent-linking.service';
import type { SendResult } from '../../../messaging/types';
import { ThreadChannelNode } from '../../../messaging/threadTransport.service';
import type { CallerAgent } from '../../../llm/types';
import { renderMustache } from '../../../prompt/mustache.template';

export const ManageToolStaticConfigSchema = z
  .object({
    description: z.string().min(1).optional(),
    prompt: z
      .string()
      .max(8192)
      .optional()
      .describe('Optional Mustache template rendered as the tool prompt.'),
    name: z
      .string()
      .regex(/^[a-z0-9_]{1,64}$/)
      .optional()
      .describe('Optional tool name. Default: Manage'),
    mode: z
      .enum(['sync', 'async'])
      .default('sync')
      .describe('Determines whether Manage waits for child responses or forwards asynchronously.'),
    timeoutMs: z
      .number()
      .int()
      .min(0)
      .default(15000)
      .describe('Timeout in milliseconds when waiting for child responses in sync mode. 0 disables timeout.'),
  })
  .strict();

const normalizeKey = (value: string): string => value.trim().normalize('NFKC').toLowerCase();

@Injectable({ scope: Scope.TRANSIENT })
export class ManageToolNode extends BaseToolNode<z.infer<typeof ManageToolStaticConfigSchema>> implements ThreadChannelNode {
  private tool?: ManageFunctionTool;
  private readonly workers: Set<AgentNode> = new Set();
  private readonly workerNames: Map<AgentNode, { name: string; normalized: string }> = new Map();
  private readonly workersByName: Map<string, AgentNode> = new Map();
  private readonly invocationContexts: Map<string, { parentThreadId: string; workerName: string; callerAgent: CallerAgent }>
    = new Map();
  private readonly pendingWaiters: Map<string, { resolve: (text: string) => void; reject: (err: Error) => void }>
    = new Map();
  private readonly timeoutHandles: Map<string, NodeJS.Timeout> = new Map();
  private readonly queuedMessages: Map<string, string[]> = new Map();

  constructor(
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
    @Inject(CallAgentLinkingService) private readonly linking: CallAgentLinkingService,
  ) {
    super();
  }

  addWorker(agent: AgentNode): void {
    if (!agent) throw new Error('ManageToolNode: agent instance is required');
    if (!this.workers.has(agent)) {
      this.workers.add(agent);
    }
    try {
      this.syncWorker(agent);
    } catch (err) {
      this.workers.delete(agent);
      throw err;
    }
  }

  removeWorker(agent: AgentNode): void {
    if (!agent) return;
    this.workers.delete(agent);
    const info = this.workerNames.get(agent);
    if (!info) return;
    const holder = this.workersByName.get(info.normalized);
    if (holder === agent) {
      this.workersByName.delete(info.normalized);
    }
    this.workerNames.delete(agent);
  }

  listWorkers(): string[] {
    this.refreshAllWorkers();
    return Array.from(this.workers).map((worker) => this.workerNames.get(worker)!.name);
  }

  getWorkers(): AgentNode[] {
    return Array.from(this.workers);
  }

  getWorkerByName(name: string): AgentNode | undefined {
    this.refreshAllWorkers();
    const normalized = normalizeKey(name);
    if (!normalized) return undefined;
    const agent = this.workersByName.get(normalized);
    if (!agent) return undefined;
    this.syncWorker(agent);
    return agent;
  }

  getWorkerName(agent: AgentNode): string {
    return this.syncWorker(agent).name;
  }

  getAgentPromptContext(state?: AgentPromptResolutionState): { agents: { name: string; role: string; prompt: string }[] } {
    const resolution = state ?? createAgentPromptResolutionState();
    this.refreshAllWorkers();
    const agents = Array.from(this.workers).map((agent) => {
      const config = agent?.config ?? {};
      const rawName = typeof config?.name === 'string' ? config.name.trim() : '';
      const role = typeof config?.role === 'string' ? config.role.trim() : '';
      const prompt = this.resolveWorkerPrompt(agent, resolution);
      return { name: rawName, role, prompt };
    });
    return { agents };
  }

  resolvePrompt(state?: AgentPromptResolutionState): string {
    const template = typeof this.config?.prompt === 'string' ? this.config.prompt.trim() : '';
    if (!template) {
      const fallback = this.getFallbackDescription();
      if (state) {
        state.cache.tools.set(this, fallback);
      }
      return fallback;
    }

    const resolution = state ?? createAgentPromptResolutionState();
    const cached = resolution.cache.tools.get(this);
    if (cached !== undefined) {
      return cached;
    }

    if (resolution.stack.tools.has(this)) {
      const fallback = this.getFallbackDescription();
      resolution.cache.tools.set(this, fallback);
      return fallback;
    }

    resolution.stack.tools.add(this);

    try {
      const context = this.getAgentPromptContext(resolution);
      const rendered = renderMustache(template, context).trim();
      const normalized = rendered.length > 0 ? rendered : this.getFallbackDescription();
      resolution.cache.tools.set(this, normalized);
      return normalized;
    } finally {
      resolution.stack.tools.delete(this);
    }
  }

  getFallbackDescription(): string {
    const raw = typeof this.config?.description === 'string' ? this.config.description.trim() : '';
    return raw.length > 0 ? raw : 'Manage tool';
  }

  private resolveWorkerPrompt(agent: AgentNode, state: AgentPromptResolutionState): string {
    if (state.stack.agents.has(agent)) {
      const fallback = this.pickAgentFallback(agent);
      const normalized = fallback.length > 0 ? fallback : DEFAULT_SYSTEM_PROMPT;
      state.cache.agents.set(agent, normalized);
      return normalized;
    }

    try {
      const resolved = agent.resolveEffectiveSystemPrompt(state);
      const trimmed = typeof resolved === 'string' ? resolved.trim() : '';
      if (trimmed.length > 0) {
        return trimmed;
      }
    } catch {
      // fall through to fallbacks
    }

    try {
      const fallback = this.pickAgentFallback(agent);
      if (fallback.length > 0) {
        return fallback;
      }
    } catch {
      // ignore config access errors
    }

    return DEFAULT_SYSTEM_PROMPT;
  }

  private pickAgentFallback(agent: AgentNode): string {
    const raw = agent?.config?.systemPrompt;
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return '';
  }

  private refreshAllWorkers(): void {
    for (const agent of this.workers) {
      this.syncWorker(agent);
    }
  }

  private syncWorker(agent: AgentNode): { name: string; normalized: string } {
    const latest = this.extractWorkerName(agent);
    const current = this.workerNames.get(agent);
    if (current && current.name === latest.name && current.normalized === latest.normalized) {
      return current;
    }
    if (current) {
      const holder = this.workersByName.get(current.normalized);
      if (holder === agent) {
        this.workersByName.delete(current.normalized);
      }
    }
    this.ensureUniqueName(agent, latest);
    this.workerNames.set(agent, latest);
    this.workersByName.set(latest.normalized, agent);
    return latest;
  }

  private extractWorkerName(agent: AgentNode): { name: string; normalized: string } {
    let config: AgentNode['config'];
    try {
      config = agent.config;
    } catch (_err) {
      throw new Error('ManageToolNode: worker agent missing configuration');
    }

    const rawName = typeof config?.name === 'string' ? config.name.trim() : '';
    if (!rawName) {
      throw new Error('ManageToolNode: worker agent requires non-empty name');
    }

    return { name: rawName, normalized: normalizeKey(rawName) };
  }

  private ensureUniqueName(agent: AgentNode, info: { name: string; normalized: string }): void {
    const existing = this.workersByName.get(info.normalized);
    if (existing && existing !== agent) {
      throw new Error(`ManageToolNode: worker with name "${info.name}" already exists`);
    }
  }

  protected createTool() {
    return new ManageFunctionTool(this.persistence, this.linking).init(this);
  }

  getTool() {
    if (!this.tool) this.tool = this.createTool();
    return this.tool;
  }

  getPortConfig() {
    return {
      targetPorts: { $self: { kind: 'instance' } },
      sourcePorts: { agent: { kind: 'method', create: 'addWorker', destroy: 'removeWorker' } },
    } as const;
  }

  getMode(): 'sync' | 'async' {
    return this.config.mode ?? 'sync';
  }

  getTimeoutMs(): number {
    const raw = this.config.timeoutMs;
    if (!Number.isFinite(raw)) return 0;
    const normalized = Math.trunc(raw as number);
    return normalized >= 0 ? normalized : 0;
  }

  async registerInvocation(context: { childThreadId: string; parentThreadId: string; workerName: string; callerAgent: CallerAgent }): Promise<void> {
    const trimmedChildId = context.childThreadId.trim();
    if (!trimmedChildId) return;

    const existingContext = this.invocationContexts.get(trimmedChildId);
    if (this.getMode() === 'sync') {
      const queuedCount = this.queuedMessages.get(trimmedChildId)?.length ?? 0;
      if (queuedCount > 0) {
        this.logger.warn?.(
          `ManageToolNode: queued messages present in sync mode before invocation${this.format({ childThreadId: trimmedChildId, queuedCount })}`,
        );
      }
    }
    if (existingContext) {
      await this.flushQueuedMessages(trimmedChildId, existingContext);
    } else {
      await this.flushQueuedMessages(trimmedChildId, undefined);
    }

    this.invocationContexts.set(trimmedChildId, {
      parentThreadId: context.parentThreadId,
      workerName: context.workerName,
      callerAgent: context.callerAgent,
    });
  }

  async awaitChildResponse(childThreadId: string, timeoutMs: number): Promise<string> {
    const trimmed = childThreadId.trim();
    if (!trimmed) throw new Error('manage_invalid_child_thread');

    const queued = this.dequeueMessage(trimmed);
    if (queued !== undefined) {
      return queued;
    }

    if (this.pendingWaiters.has(trimmed)) {
      throw new Error('manage_waiter_already_registered');
    }

    return await new Promise<string>((resolve, reject) => {
      const candidate = Number.isFinite(timeoutMs) ? Math.trunc(timeoutMs) : this.getTimeoutMs();
      const safeTimeout = Math.max(0, candidate);
      let timer: NodeJS.Timeout | null = null;
      if (safeTimeout > 0) {
        timer = setTimeout(() => {
          this.pendingWaiters.delete(trimmed);
          this.timeoutHandles.delete(trimmed);
          reject(new Error('manage_timeout'));
        }, safeTimeout);
        this.timeoutHandles.set(trimmed, timer);
      } else {
        this.timeoutHandles.delete(trimmed);
      }
      this.pendingWaiters.set(trimmed, {
        resolve: (text) => {
          if (timer) {
            clearTimeout(timer);
            this.timeoutHandles.delete(trimmed);
          }
          this.pendingWaiters.delete(trimmed);
          resolve(text);
        },
        reject: (err) => {
          if (timer) {
            clearTimeout(timer);
            this.timeoutHandles.delete(trimmed);
          }
          this.pendingWaiters.delete(trimmed);
          reject(err);
        },
      });
    });
  }

  async sendToChannel(threadId: string, text: string): Promise<SendResult> {
    const normalizedThreadId = threadId?.trim();
    if (!normalizedThreadId) {
      return { ok: false, error: 'missing_thread_id' };
    }
    const trimmedMessage = text.trim();
    if (!trimmedMessage) {
      return { ok: false, error: 'empty_message' };
    }

    const mode = this.getMode();
    const waiter = this.pendingWaiters.get(normalizedThreadId);
    if (waiter) {
      waiter.resolve(text);
      return { ok: true, threadId: normalizedThreadId };
    }

    if (mode === 'sync') {
      this.logger.error?.(
        `ManageToolNode: sync response received without pending waiter${this.format({ threadId: normalizedThreadId })}`,
      );
      return { ok: false, error: 'missing_waiter', threadId: normalizedThreadId };
    }

    const context = this.invocationContexts.get(normalizedThreadId);
    if (!context) {
      this.logger.warn?.(
        `ManageToolNode: async response received without invocation context${this.format({ threadId: normalizedThreadId })}`,
      );
      return { ok: false, error: 'missing_invocation_context', threadId: normalizedThreadId };
    }

    try {
      await this.forwardToParent(context, text, normalizedThreadId);
      return { ok: true, threadId: normalizedThreadId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error?.(
        `ManageToolNode: failed to forward async response${this.format({ childThreadId: normalizedThreadId, parentThreadId: context.parentThreadId, error: message })}`,
      );
      return { ok: false, error: 'forward_failed', threadId: normalizedThreadId };
    }
  }

  renderWorkerResponse(workerName: string, text: string): string {
    if (!text) return `Response from: ${workerName}`;
    return `Response from: ${workerName}` + '\n' + text;
  }

  renderAsyncAcknowledgement(workerName: string): string {
    return `Request sent to ${workerName}; response will follow asynchronously.`;
  }

  private async forwardToParent(
    context: { parentThreadId: string; workerName: string; callerAgent: CallerAgent },
    text: string,
    _childThreadId: string,
  ): Promise<void> {
    const formatted = this.renderWorkerResponse(context.workerName, text);
    await context.callerAgent.invoke(context.parentThreadId, [HumanMessage.fromText(formatted)]);
  }

  private async flushQueuedMessages(
    childThreadId: string,
    context?: { parentThreadId: string; workerName: string; callerAgent: CallerAgent },
  ): Promise<void> {
    const queue = this.queuedMessages.get(childThreadId);
    if (!queue || queue.length === 0) return;
    this.queuedMessages.delete(childThreadId);

    if (!context) {
      this.logger.warn?.(
        `ManageToolNode: discarding queued messages due to missing context${this.format({ childThreadId, count: queue.length })}`,
      );
      return;
    }

    for (const message of queue) {
      try {
        await this.forwardToParent(context, message, childThreadId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error?.(
          `ManageToolNode: failed to flush queued response${this.format({ childThreadId, parentThreadId: context.parentThreadId, error: errorMessage })}`,
        );
        throw err instanceof Error ? err : new Error(errorMessage);
      }
    }
  }

  private enqueueMessage(threadId: string, text: string): void {
    const queue = this.queuedMessages.get(threadId) ?? [];
    queue.push(text);
    this.queuedMessages.set(threadId, queue);
  }

  private dequeueMessage(threadId: string): string | undefined {
    const queue = this.queuedMessages.get(threadId);
    if (!queue || queue.length === 0) return undefined;
    const next = queue.shift();
    if (queue.length === 0) {
      this.queuedMessages.delete(threadId);
    }
    return next;
  }

  private format(context?: Record<string, unknown>): string {
    return context ? ` ${JSON.stringify(context)}` : '';
  }
}
