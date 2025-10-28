import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { LLMContext } from '../../../llm/types';
import { LoggerService } from '../../../core/services/logger.service';

export const finishSchema = z.object({ note: z.string() }).strict();

interface FinishFunctionToolDeps {
  logger: LoggerService;
}

export class FinishFunctionTool extends FunctionTool<typeof finishSchema> {
  constructor(private deps: FinishFunctionToolDeps) {
    super();
  }
  get name() {
    return 'finish';
  }
  get schema() {
    return finishSchema;
  }
  get description() {
    return 'finish marks the completion of the tool sequence without ending the conversation. It signals that the agent has completed all necessary actions for now and is waiting for further input (e.g., user message or trigger).';
  }
  async execute(args: z.infer<typeof finishSchema>, ctx: LLMContext): Promise<string> {
    const { note } = args;
    this.deps.logger.info('finish tool invoked', { note });
    ctx.finishSignal.activate();
    return note;
  }
}
