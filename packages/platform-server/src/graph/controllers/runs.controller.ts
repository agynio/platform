import { Controller, Inject } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LiveGraphRuntime } from '../../graph-core/liveGraph.manager';

// DTOs
export class ListRunsParamsDto {
  @IsString()
  nodeId!: string;
}

export class ListRunsQueryDto {
  @IsOptional()
  @IsEnum({ running: 'running', terminated: 'terminated', all: 'all' } as const)
  status?: 'running' | 'terminated' | 'all';
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
  constructor(@Inject(LiveGraphRuntime) private readonly runtime: LiveGraphRuntime) {}
}
