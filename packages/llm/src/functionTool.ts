import { FunctionTool as OpenAIFunctionTool, ResponseInputItem } from 'openai/resources/responses/responses.mjs';
import z from 'zod';

export type FunctionToolOuput = ResponseInputItem.FunctionCallOutput['output'];

export abstract class FunctionTool<A extends z.ZodType = z.ZodType, C = {}> {
  abstract get name(): string;
  abstract get schema(): A;
  abstract get description(): string;

  abstract execute(args: z.infer<A>, ctx: C): Promise<FunctionToolOuput>;

  definition(): OpenAIFunctionTool {
    return {
      name: this.name,
      parameters: z.toJSONSchema(this.schema),
      type: 'function',
      strict: false,
      description: this.description,
    };
  }
}
