import { Controller, Get, Post, Param, Query, HttpCode, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AgentRunService } from '../nodes/agentRun.repository';
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
  constructor(
    @Inject(AgentRunService) private readonly runs: AgentRunService,
    @Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime,
  ) {}

  @Get(':nodeId/runs')
  async listRuns(
    @Param() params: ListRunsParamsDto,
    @Query() query: ListRunsQueryDto,
  ): Promise<{ items: Array<{ nodeId: string; threadId: string; runId: string; status: string; startedAt: string; updatedAt: string; expiresAt?: string }> }> {
    const status = query?.status ?? 'all';
    const items = await this.runs.list(params.nodeId, status);
    return {
      items: items.map(({ _id, nodeId, threadId, runId, status, startedAt, updatedAt, expiresAt }) => ({
        nodeId,
        threadId,
        runId,
        status: String(status),
        startedAt: startedAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
      })),
    };
  }

  @Post(':nodeId/runs/:runId/terminate')
  @HttpCode(202)
  async terminateByRun(@Param() params: TerminateByRunParamsDto): Promise<{ status: 'terminating' }> {
    const runtime = this.runtime;
    type TerminableAgent = {
      terminateRun: (threadId: string, runId?: string) => 'terminated' | 'not_running' | 'queued_canceled';
    };
    const nodeInst = runtime.getNodeInstance(params.nodeId);
    const inst = nodeInst && (nodeInst as unknown as Record<string, unknown>);
    const terminateFn = inst && (typeof inst['terminateRun'] === 'function' ? (inst['terminateRun'] as TerminableAgent['terminateRun']) : undefined);
    if (!terminateFn) throw new NotFoundException('not_terminable');
    const doc = await this.runs.findByRunId(params.nodeId, params.runId);
    const threadId = doc?.threadId;
    if (!threadId) throw new NotFoundException('run_not_found');
    const res = terminateFn(threadId, params.runId);
    if (res === 'terminated' || res === 'queued_canceled') {
      try { await this.runs.markTerminating(params.nodeId, params.runId); } catch {}
      return { status: 'terminating' } as const;
    }
    throw new ConflictException('not_running');
  }

  @Post(':nodeId/threads/:threadId/terminate')
  @HttpCode(202)
  async terminateByThread(@Param() params: TerminateByThreadParamsDto): Promise<{ status: 'terminating' }> {
    const runtime = this.runtime;
    type TerminableAgent = {
      terminateRun: (threadId: string, runId?: string) => 'terminated' | 'not_running' | 'queued_canceled';
      getCurrentRunId?: (threadId: string) => string | undefined;
    };
    const nodeInst = runtime.getNodeInstance(params.nodeId);
    const inst = nodeInst && (nodeInst as unknown as Record<string, unknown>);
    const terminateFn = inst && (typeof inst['terminateRun'] === 'function' ? (inst['terminateRun'] as TerminableAgent['terminateRun']) : undefined);
    const getCurrentRunId = inst && (typeof inst['getCurrentRunId'] === 'function' ? (inst['getCurrentRunId'] as TerminableAgent['getCurrentRunId']) : undefined);
    if (!terminateFn || !getCurrentRunId) {
      throw new NotFoundException('not_terminable');
    }
    const runId = getCurrentRunId(params.threadId);
    if (!runId) throw new ConflictException('not_running');
    const res = terminateFn(params.threadId, runId);
    if (res === 'terminated' || res === 'queued_canceled') {
      try { await this.runs.markTerminating(params.nodeId, runId); } catch {}
      return { status: 'terminating' } as const;
    }
    throw new ConflictException('not_running');
  }
}
