import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { LLMContext } from '../../../llm/types';
import { Logger } from '@nestjs/common';

export const finishSchema = z.object({ note: z.string() }).strict();

export class FinishFunctionTool extends FunctionTool<typeof finishSchema> {
  private readonly logger = new Logger(FinishFunctionTool.name);

  constructor() {
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
    this.logger.log(`finish tool invoked note=${note}`);
    ctx.finishSignal.activate();
    return note;
  }
}
