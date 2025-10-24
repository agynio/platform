import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AgentRunService } from '../../nodes/agentRun.repository';
import { LiveGraphRuntime } from '../liveGraph.manager';

// DTOs
export class ListRunsParamsDto {
  @IsString()
  nodeId!: string;
}

export class ListRunsQueryDto {
  @IsOptional()
  @IsEnum(['running', 'terminating', 'all'])
  status?: 'running' | 'terminating' | 'all';
}

export class TerminateByRunParamsDto {
  @IsString()
  nodeId!: string;
  @IsString()
  runId!: string;
}

export class TerminateByThreadParamsDto {
  @IsString()
  nodeId!: string;
  @IsString()
  threadId!: string;
}

@Controller('graph/nodes')
export class RunsController {
  constructor(private readonly runs: AgentRunService, private readonly runtime: LiveGraphRuntime) {}

  @Get(':nodeId/runs')
  async listRuns(
    @Param() params: ListRunsParamsDto,
    @Query() query: ListRunsQueryDto,
  ): Promise<{ items: Array<{ nodeId: string; threadId: string; runId: string; status: string; startedAt: string; updatedAt: string; expiresAt?: string }> }> {
    const status = query?.status ?? 'all';
    const items = await this.runs.list(params.nodeId, status);
    return {
      items: items.map(({ _id, ...rest }) => ({
        ...rest,
        startedAt: rest.startedAt.toISOString(),
        updatedAt: rest.updatedAt.toISOString(),
        ...(rest.expiresAt ? { expiresAt: rest.expiresAt.toISOString() } : {}),
      })),
    };
  }

  @Post(':nodeId/runs/:runId/terminate')
  @HttpCode(202)
  async terminateByRun(@Param() params: TerminateByRunParamsDto): Promise<{ status: 'terminating' }> {
    const runtime = this.runtime;
    type TerminableAgent = {
      terminateRun: (threadId: string, runId?: string) => 'ok' | 'not_running' | 'not_found';
    };
    const inst = runtime.getNodeInstance<TerminableAgent>(params.nodeId);
    if (!inst || typeof inst.terminateRun !== 'function') throw new NotFoundException('not_terminable');
    const doc = await this.runs.findByRunId(params.nodeId, params.runId);
    const threadId = doc?.threadId;
    if (!threadId) throw new NotFoundException('run_not_found');
    const res = inst.terminateRun(threadId, params.runId);
    if (res === 'ok') {
      try { await this.runs.markTerminating(params.nodeId, params.runId); } catch {}
      return { status: 'terminating' } as const;
    }
    if (res === 'not_found') throw new NotFoundException('run_not_found');
    throw new ConflictException('not_running');
  }

  @Post(':nodeId/threads/:threadId/terminate')
  @HttpCode(202)
  async terminateByThread(@Param() params: TerminateByThreadParamsDto): Promise<{ status: 'terminating' }> {
    const runtime = this.runtime;
    type TerminableAgent = {
      terminateRun: (threadId: string, runId?: string) => 'ok' | 'not_running' | 'not_found';
      getCurrentRunId?: (threadId: string) => string | undefined;
    };
    const inst = runtime.getNodeInstance<TerminableAgent>(params.nodeId);
    if (!inst || typeof inst.terminateRun !== 'function' || typeof inst.getCurrentRunId !== 'function') {
      throw new NotFoundException('not_terminable');
    }
    const runId = inst.getCurrentRunId(params.threadId);
    if (!runId) throw new ConflictException('not_running');
    const res = inst.terminateRun(params.threadId, runId);
    if (res === 'ok') {
      try { await this.runs.markTerminating(params.nodeId, runId); } catch {}
      return { status: 'terminating' } as const;
    }
    if (res === 'not_found') throw new NotFoundException('run_not_found');
    throw new ConflictException('not_running');
  }
}
