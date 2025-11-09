import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleRef } from '@nestjs/core';
import type { MemoryScope } from '../nodes/memory.types';
import { MemoryService } from '../nodes/memory.service';
import { PrismaService } from '../../core/services/prisma.service';

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
  constructor(
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(PrismaService) private readonly prismaSvc: PrismaService,
  ) {}

  private getSvc(nodeId: string, scope: MemoryScope, threadId?: string): MemoryService {
    const svc = this.moduleRef.get(MemoryService, { strict: false });
    return svc.init({ nodeId, scope, threadId });
  }

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
    const prisma = this.prismaSvc.getClient();
    // Use raw query to avoid requiring Prisma model
    const rows = await prisma.$queryRaw<Array<{ node_id: string; scope: string; thread_id: string | null }>>`
      SELECT node_id, scope, thread_id FROM memories ORDER BY node_id ASC
    `;
    return { items: rows.map((r) => ({ nodeId: r.node_id, scope: r.scope as MemoryScope, threadId: r.thread_id ?? undefined })) };
  }

  @Get(':nodeId/:scope/list')
  async list(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ items: Array<{ name: string; kind: 'file'|'dir' }> }> {
    const { nodeId, scope } = params;
    const path = query.path ?? '/';
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    const svc = this.getSvc(nodeId, scope, threadId);
    const items = await svc.list(path || '/');
    return { items };
  }

  @Get(':nodeId/:scope/stat')
  async stat(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ kind: 'file'|'dir'|'none'; size?: number }> {
    const { nodeId, scope } = params;
    const path = query.path;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    const svc = this.getSvc(nodeId, scope, threadId);
    return svc.stat(path);
  }

  @Get(':nodeId/:scope/read')
  async read(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ content: string }> {
    const { nodeId, scope } = params;
    const path = query.path;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    const svc = this.getSvc(nodeId, scope, threadId);
    try { const content = await svc.read(path); return { content }; }
    catch (e) {
      const msg = (e as Error)?.message || '';
      if (msg.startsWith('EISDIR')) throw new HttpException({ error: 'EISDIR' }, HttpStatus.BAD_REQUEST);
      if (msg.startsWith('ENOENT')) throw new HttpException({ error: 'ENOENT' }, HttpStatus.NOT_FOUND);
      throw e;
    }
  }

  @Post(':nodeId/:scope/append')
  @HttpCode(204)
  async append(@Param() params: DocParamsDto, @Body() body: AppendBodyDto, @Query() query: ThreadOnlyQueryDto): Promise<void> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, body.threadId, query.threadId);
    const svc = this.getSvc(nodeId, scope, threadId);
    try { await svc.append(body.path, body.data); }
    catch (e) {
      const msg = (e as Error)?.message || '';
      if (msg.startsWith('EISDIR')) throw new HttpException({ error: 'EISDIR' }, HttpStatus.BAD_REQUEST);
      throw e;
    }
  }

  @Post(':nodeId/:scope/update')
  async update(@Param() params: DocParamsDto, @Body() body: UpdateBodyDto, @Query() query: ThreadOnlyQueryDto): Promise<{ replaced: number }> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, body.threadId, query.threadId);
    const svc = this.getSvc(nodeId, scope, threadId);
    try { const replaced = await svc.update(body.path, body.oldStr, body.newStr); return { replaced }; }
    catch (e) {
      const msg = (e as Error)?.message || '';
      if (msg.startsWith('EISDIR')) throw new HttpException({ error: 'EISDIR' }, HttpStatus.BAD_REQUEST);
      if (msg.startsWith('ENOENT')) throw new HttpException({ error: 'ENOENT' }, HttpStatus.NOT_FOUND);
      throw e;
    }
  }

  @Post(':nodeId/:scope/ensure-dir')
  @HttpCode(204)
  async ensureDir(@Param() params: DocParamsDto, @Body() body: EnsureDirBodyDto, @Query() query: ThreadOnlyQueryDto): Promise<void> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, body.threadId, query.threadId);
    const svc = this.getSvc(nodeId, scope, threadId);
    await svc.ensureDir(body.path);
  }

  @Delete(':nodeId/:scope')
  async remove(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ files: number; dirs: number }> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    const svc = this.getSvc(nodeId, scope, threadId);
    return svc.delete(query.path);
  }

  @Get(':nodeId/:scope/dump')
  async dump(@Param() params: DocParamsDto, @Query() query: ThreadOnlyQueryDto): Promise<unknown> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    const svc = this.getSvc(nodeId, scope, threadId);
    return svc.dump();
  }
}
