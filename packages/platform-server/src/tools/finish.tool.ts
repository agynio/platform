import { tool, DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool } from './base.tool';
import { TerminateResponse } from './terminateResponse';
import { LoggerService } from '../services/logger.service';

const finishSchema = z.object({ note: z.string().optional() });

export class FinishTool extends BaseTool {
  constructor(logger: LoggerService) { super(logger); }
  init(): DynamicStructuredTool {
    return tool(
      async (raw) => {
        const { note } = finishSchema.parse(raw);
        return new TerminateResponse(note);
      },
      {
        name: 'finish',
        description:
          'finish marks the completion of the tool sequence without ending the conversation. It signals that the agent has completed all necessary actions for now and is waiting for further input (e.g., user message or reminder trigger).',
        schema: finishSchema,
      },
    );
  }
}

export const FinishToolStaticConfigSchema = z.object({}).strict();
