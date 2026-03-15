import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Put } from '@nestjs/common';
import { create } from '@bufbuild/protobuf';
import { z } from 'zod';
import { listAllPages } from '../../teams/teamsGrpc.pagination';
import { TEAMS_GRPC_CLIENT } from '../../teams/teamsGrpc.token';
import type { TeamsGrpcClient } from '../../teams/teamsGrpc.client';
import {
  CreateVariableRequestSchema,
  DeleteVariableRequestSchema,
  ListVariablesRequestSchema,
  UpdateVariableRequestSchema,
  type Variable,
} from '../../proto/gen/agynio/api/teams/v1/teams_pb';

const CreateVariableSchema = z
  .object({
    key: z.string().min(1),
    value: z.string(),
    description: z.string().optional().default(''),
  })
  .strict();

const UpdateVariableSchema = z
  .object({
    key: z.string().min(1).optional(),
    value: z.string().optional(),
    description: z.string().optional(),
  })
  .strict()
  .refine((data) => data.key !== undefined || data.value !== undefined || data.description !== undefined, {
    message: 'empty_patch',
  });

type VariableResponse = {
  id: string;
  key: string;
  value: string;
  description: string;
};

@Controller('api/graph/variables')
export class VariablesController {
  constructor(@Inject(TEAMS_GRPC_CLIENT) private readonly teamsClient: TeamsGrpcClient) {}

  private normalizeId(rawId: string): string {
    const id = String(rawId ?? '').trim();
    if (!id) throw new HttpException({ error: 'invalid_variable_id' }, HttpStatus.BAD_REQUEST);
    return id;
  }

  private normalizeKey(rawKey: string): string {
    const key = String(rawKey ?? '').trim();
    if (!key) throw new HttpException({ error: 'invalid_variable_key' }, HttpStatus.BAD_REQUEST);
    return key;
  }

  private mapVariable(variable: Variable): VariableResponse {
    const id = variable.meta?.id;
    if (!id) {
      throw new HttpException({ error: 'variable_missing_id' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return {
      id,
      key: variable.key,
      value: variable.value,
      description: variable.description,
    };
  }

  @Get()
  async listVariables(): Promise<{ items: VariableResponse[] }> {
    const variables = await listAllPages(async (pageToken, pageSize) => {
      const request = create(ListVariablesRequestSchema, {
        pageSize,
        pageToken: pageToken ?? '',
        query: '',
      });
      const response = await this.teamsClient.listVariables(request);
      return {
        items: response.variables ?? [],
        nextPageToken: response.nextPageToken ?? undefined,
      };
    });
    return { items: variables.map((variable) => this.mapVariable(variable)) };
  }

  @Post()
  async createVariable(@Body() body: unknown): Promise<VariableResponse> {
    const parsed = CreateVariableSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ error: 'invalid_payload' }, HttpStatus.BAD_REQUEST);
    }
    const key = this.normalizeKey(parsed.data.key);
    const request = create(CreateVariableRequestSchema, {
      key,
      value: parsed.data.value,
      description: parsed.data.description,
    });
    const variable = await this.teamsClient.createVariable(request);
    return this.mapVariable(variable);
  }

  @Put(':id')
  async updateVariable(@Param('id') rawId: string, @Body() body: unknown): Promise<VariableResponse> {
    const id = this.normalizeId(rawId);
    const parsed = UpdateVariableSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ error: 'invalid_payload' }, HttpStatus.BAD_REQUEST);
    }
    const request = create(UpdateVariableRequestSchema, {
      id,
      key: parsed.data.key !== undefined ? this.normalizeKey(parsed.data.key) : undefined,
      value: parsed.data.value,
      description: parsed.data.description,
    });
    const variable = await this.teamsClient.updateVariable(request);
    return this.mapVariable(variable);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteVariable(@Param('id') rawId: string): Promise<void> {
    const id = this.normalizeId(rawId);
    const request = create(DeleteVariableRequestSchema, { id });
    await this.teamsClient.deleteVariable(request);
  }
}
