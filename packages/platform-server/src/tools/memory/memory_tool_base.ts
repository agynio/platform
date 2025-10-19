import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from '../base.tool';
import { MemoryService } from '../../services/memory.service';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { LoggerService } from '../../services/logger.service';

// Common base to inject a memory service factory into individual memory tools
export abstract class MemoryToolBase extends BaseTool {
  protected serviceFactory: ((opts: { threadId?: string }) => MemoryService) | undefined;
  constructor(protected loggerService: LoggerService) { super(loggerService); }

  // Back-compat: previous port wired setMemoryFactory; continue to support.
  setMemoryFactory(factory: (opts: { threadId?: string }) => MemoryService): void {
    this.serviceFactory = factory;
  }

  // Preferred: accept MemoryNode-like or factory directly.
  setMemorySource(
    source:
      | ((opts: { threadId?: string }) => MemoryService)
      | { getMemoryService: (opts: { threadId?: string }) => MemoryService },
  ): void {
    if (typeof source === 'function') {
      this.serviceFactory = source as (opts: { threadId?: string }) => MemoryService;
    } else if (source && typeof (source as any).getMemoryService === 'function') {
      this.serviceFactory = (opts: { threadId?: string }) => (source as any).getMemoryService(opts);
    } else {
      throw new Error('Invalid argument to setMemorySource');
    }
  }

  protected requireFactory(): (opts: { threadId?: string }) => MemoryService {
    if (!this.serviceFactory) {
      // Explicit guidance for runtime wiring
      throw new Error('Memory not connected: wire Memory.$self to Tool.$memory (setMemorySource)');
    }
    return this.serviceFactory;
  }

  abstract init(config?: LangGraphRunnableConfig): DynamicStructuredTool;
}

// UI-safe path schemas for tool argument JSON Schema generation.
// IMPORTANT: Avoid .transform in UI schemas; transforms cannot be represented in JSON Schema.
export const PathSchemaUI = z
  .string()
  .min(1)
  // Allow A-Z a-z 0-9 underscore, dash, space and forward slashes only.
  .regex(/^[A-Za-z0-9_\-\/ ]+$/)
  .describe('Path; leading slash optional; will be normalized at runtime');

export const OptionalPathSchemaUI = PathSchemaUI.optional();

// Runtime normalization/validation used by memory tools prior to invoking MemoryService.
export function normalizePathRuntime(input: string): string {
  if (!input) throw new Error('path is required');
  // convert backslashes and collapse multiple slashes
  let p = input.replace(/\\+/g, '/');
  p = p.replace(/\/+?/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  // trim trailing slash except for root
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/g, '');
  if (p.includes('..')) throw new Error('invalid path: ".." not allowed');
  if (p.includes('$')) throw new Error('invalid path: "$" not allowed');
  return p;
}

// Feature flag for verbose memory debug logging. Intentionally minimal to avoid PII leakage.
export function isMemoryDebugEnabled(): boolean {
  const v = String(process.env.DEBUG_MEMORY || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}
