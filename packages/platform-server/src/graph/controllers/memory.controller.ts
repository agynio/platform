import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { MemoryScope } from '../../nodes/memory/memory.types';
import { MemoryService } from '../../nodes/memory/memory.service';

class DocParamsDto {
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @IsString()
  @IsIn(['global', 'perThread'])
  scope!: MemoryScope;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  threadId?: string;
}

class PathQueryDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}

class PathWithThreadQueryDto extends PathQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  threadId?: string;
}

class ThreadAwareDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  threadId?: string;
}

class ThreadOnlyQueryDto extends ThreadAwareDto {}

class AppendBodyDto extends ThreadAwareDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsString()
  @IsNotEmpty()
  data!: string;
}

class UpdateBodyDto extends ThreadAwareDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsString()
  oldStr!: string;

  @IsString()
  newStr!: string;
}

class EnsureDirBodyDto extends ThreadAwareDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}

@Controller('api/memory')
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memoryService: MemoryService) {}

  private resolveThreadId(scope: MemoryScope, ...candidates: Array<string | undefined>): string | undefined {
    if (scope !== 'perThread') return undefined;
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed.length > 0) return trimmed;
      }
    }
    throw new HttpException({ error: 'threadId required for perThread scope' }, HttpStatus.BAD_REQUEST);
  }

  @Get('docs')
  async listDocs(): Promise<{ items: Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> }> {
    const items = await this.memoryService.listDocs();
    return { items };
  }

  @Get(':nodeId/:scope/list')
  async list(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ items: Array<{ name: string; hasSubdocs: boolean }> }> {
    const { nodeId, scope } = params;
    const path = query.path ?? '/';
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    const items = await this.memoryService.list(nodeId, scope, threadId, path || '/');
    return { items };
  }

  @Get(':nodeId/:scope/stat')
  async stat(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ exists: boolean; hasSubdocs: boolean; contentLength: number }> {
    const { nodeId, scope } = params;
    const path = query.path;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    return this.memoryService.stat(nodeId, scope, threadId, path);
  }

  @Get(':nodeId/:scope/read')
  async read(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ content: string }> {
    const { nodeId, scope } = params;
    const path = query.path;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    try {
      const content = await this.memoryService.read(nodeId, scope, threadId, path);
      return { content };
    } catch (e) {
      const msg = (e as Error)?.message || '';
      if (msg.startsWith('ENOENT')) throw new HttpException({ error: 'ENOENT' }, HttpStatus.NOT_FOUND);
      throw e;
    }
  }

  @Post(':nodeId/:scope/append')
  @HttpCode(204)
  async append(@Param() params: DocParamsDto, @Body() body: AppendBodyDto, @Query() query: ThreadOnlyQueryDto): Promise<void> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, body.threadId, query.threadId);
    await this.memoryService.append(nodeId, scope, threadId, body.path, body.data);
  }

  @Post(':nodeId/:scope/update')
  async update(@Param() params: DocParamsDto, @Body() body: UpdateBodyDto, @Query() query: ThreadOnlyQueryDto): Promise<{ replaced: number }> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, body.threadId, query.threadId);
    try {
      const replaced = await this.memoryService.update(nodeId, scope, threadId, body.path, body.oldStr, body.newStr);
      return { replaced };
    } catch (e) {
      const msg = (e as Error)?.message || '';
      if (msg.startsWith('ENOENT')) throw new HttpException({ error: 'ENOENT' }, HttpStatus.NOT_FOUND);
      throw e;
    }
  }

  @Post(':nodeId/:scope/ensure-dir')
  @HttpCode(204)
  async ensureDir(@Param() params: DocParamsDto, @Body() body: EnsureDirBodyDto, @Query() query: ThreadOnlyQueryDto): Promise<void> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, body.threadId, query.threadId);
    await this.memoryService.ensureDir(nodeId, scope, threadId, body.path);
  }

  @Delete(':nodeId/:scope')
  async remove(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ removed: number }> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    return this.memoryService.delete(nodeId, scope, threadId, query.path);
  }

  @Get(':nodeId/:scope/dump')
  async dump(@Param() params: DocParamsDto, @Query() query: ThreadOnlyQueryDto): Promise<unknown> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    return this.memoryService.dump(nodeId, scope, threadId);
  }
}
