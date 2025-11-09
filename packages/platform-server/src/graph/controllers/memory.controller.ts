import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleRef } from '@nestjs/core';
import type { MemoryScope } from '../nodes/memory.repository';
import { MemoryService } from '../nodes/memory.repository';
import { PrismaService } from '../../core/services/prisma.service';

class DocParamsDto {
  @IsString()
  @IsNotEmpty()
  nodeId!: string;

  @IsString()
  @IsIn(['global', 'perThread'])
  scope!: MemoryScope;

  @IsString()
  @IsOptional()
  threadId?: string;
}

class PathQueryDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}

class AppendBodyDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsString()
  @IsNotEmpty()
  data!: string;
}

class UpdateBodyDto {
  @IsString()
  @IsNotEmpty()
  path!: string;

  @IsString()
  oldStr!: string;

  @IsString()
  newStr!: string;
}

class EnsureDirBodyDto {
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

  @Get('docs')
  async listDocs(): Promise<{ items: Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> }> {
    const prisma = this.prismaSvc.getClient();
    // Use raw query to avoid requiring Prisma model
    const rows = await prisma.$queryRawUnsafe<Array<{ node_id: string; scope: string; thread_id: string | null }>>(
      `SELECT node_id, scope, thread_id FROM memories ORDER BY node_id ASC`
    );
    return { items: rows.map((r) => ({ nodeId: r.node_id, scope: r.scope as MemoryScope, threadId: r.thread_id ?? undefined })) };
  }

  @Get(':nodeId/:scope/list')
  async list(@Param() params: DocParamsDto, @Query() query: PathQueryDto): Promise<{ items: Array<{ name: string; kind: 'file'|'dir' }> }> {
    const { nodeId, scope } = params;
    const path = query.path ?? '/';
    const svc = this.getSvc(nodeId, scope, params.scope === 'perThread' ? params.threadId || (query as any).threadId : undefined);
    const items = await svc.list(path || '/');
    return { items };
  }

  @Get(':nodeId/:scope/stat')
  async stat(@Param() params: DocParamsDto, @Query() query: PathQueryDto): Promise<{ kind: 'file'|'dir'|'none'; size?: number }> {
    const { nodeId, scope } = params;
    const path = query.path;
    const svc = this.getSvc(nodeId, scope, params.scope === 'perThread' ? params.threadId || (query as any).threadId : undefined);
    return svc.stat(path);
  }

  @Get(':nodeId/:scope/read')
  async read(@Param() params: DocParamsDto, @Query() query: PathQueryDto): Promise<{ content: string }> {
    const { nodeId, scope } = params;
    const path = query.path;
    const svc = this.getSvc(nodeId, scope, params.scope === 'perThread' ? params.threadId || (query as any).threadId : undefined);
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
  async append(@Param() params: DocParamsDto, @Body() body: AppendBodyDto): Promise<void> {
    const { nodeId, scope } = params;
    const svc = this.getSvc(nodeId, scope, params.scope === 'perThread' ? params.threadId : undefined);
    try { await svc.append(body.path, body.data); }
    catch (e) {
      const msg = (e as Error)?.message || '';
      if (msg.startsWith('EISDIR')) throw new HttpException({ error: 'EISDIR' }, HttpStatus.BAD_REQUEST);
      throw e;
    }
  }

  @Post(':nodeId/:scope/update')
  async update(@Param() params: DocParamsDto, @Body() body: UpdateBodyDto): Promise<{ replaced: number }> {
    const { nodeId, scope } = params;
    const svc = this.getSvc(nodeId, scope, params.scope === 'perThread' ? params.threadId : undefined);
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
  async ensureDir(@Param() params: DocParamsDto, @Body() body: EnsureDirBodyDto): Promise<void> {
    const { nodeId, scope } = params;
    const svc = this.getSvc(nodeId, scope, params.scope === 'perThread' ? params.threadId : undefined);
    await svc.ensureDir(body.path);
  }

  @Delete(':nodeId/:scope')
  async remove(@Param() params: DocParamsDto, @Query() query: PathQueryDto): Promise<{ files: number; dirs: number }> {
    const { nodeId, scope } = params;
    const svc = this.getSvc(nodeId, scope, params.scope === 'perThread' ? params.threadId || (query as any).threadId : undefined);
    return svc.delete(query.path);
  }

  @Get(':nodeId/:scope/dump')
  async dump(@Param() params: DocParamsDto): Promise<unknown> {
    const { nodeId, scope } = params;
    const svc = this.getSvc(nodeId, scope, params.scope === 'perThread' ? params.threadId : undefined);
    return svc.dump();
  }
}

