import { BadRequestException, Body, Controller, Inject, Param, Post } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TerminalSessionsService } from './terminal.sessions.service';

class CreateTerminalSessionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(40)
  @Max(400)
  cols?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(200)
  rows?: number;

  @IsOptional()
  @IsString()
  shell?: string;
}

@Controller('api/containers/:workspaceId/terminal')
export class ContainerTerminalController {
  constructor(@Inject(TerminalSessionsService) private readonly sessions: TerminalSessionsService) {}

  @Post('sessions')
  async createSession(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateTerminalSessionDto,
  ) {
    if (!workspaceId) throw new BadRequestException('workspace_id_required');
    try {
      return await this.sessions.createSession(workspaceId, body ?? {});
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : String(err));
    }
  }
}
