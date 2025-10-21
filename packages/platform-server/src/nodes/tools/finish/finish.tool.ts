import z from 'zod';

import { FunctionTool } from '@agyn/llm';
import { LoggerService } from '../../../services/logger.service';
import { TerminateResponse } from './terminateResponse';

export const finishSchema = z.object({ note: z.string().optional() }).strict();

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
  async execute(args: z.infer<typeof finishSchema>): Promise<string> {
    const { note } = args;
    this.deps.logger.info('finish tool invoked', { hasNote: !!note });
    // Represent TerminateResponse as serialized object for function output
    const resp = new TerminateResponse(note);
    return JSON.stringify({ terminate: true, note: resp.message || '' });
  }
}
