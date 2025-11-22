import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Query } from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ModuleRef } from '@nestjs/core';
import type { MemoryScope } from '../../nodes/memory/memory.types';
import { MemoryService } from '../../nodes/memory/memory.service';
import { PrismaService } from '../../core/services/prisma.service';
import { GraphRepository } from '../graph.repository';

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
    @Inject(GraphRepository) private readonly graphRepo: GraphRepository,
  ) {}

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
    const [graph, rows] = await Promise.all([
      this.graphRepo
        .get('main')
        .catch(() => null),
      prisma.$queryRaw<Array<{ node_id: string; scope: string; thread_id: string | null }>>`
        SELECT node_id, scope, thread_id FROM memories ORDER BY node_id ASC
      `,
    ]);

    if (!graph) {
      return {
        items: rows.map((row) => ({
          nodeId: row.node_id,
          scope: row.scope as MemoryScope,
          threadId: row.thread_id ?? undefined,
        })),
      };
    }

    const memoryNodes = (graph.nodes ?? []).filter((node) => node.template === 'memory');
    const scopeByNode = new Map<string, MemoryScope>();
    for (const node of memoryNodes) {
      const config = node.config as { scope?: unknown } | undefined;
      const scope: MemoryScope = config?.scope === 'perThread' ? 'perThread' : 'global';
      if (!scopeByNode.has(node.id)) scopeByNode.set(node.id, scope);
    }

    const threadIdsByNode = new Map<string, Set<string>>();
    for (const row of rows) {
      const nodeScope = scopeByNode.get(row.node_id);
      if (!nodeScope || nodeScope !== 'perThread') continue;
      if (row.scope !== 'perThread' || typeof row.thread_id !== 'string') continue;
      const trimmed = row.thread_id.trim();
      if (!trimmed) continue;
      if (!threadIdsByNode.has(row.node_id)) threadIdsByNode.set(row.node_id, new Set());
      threadIdsByNode.get(row.node_id)!.add(trimmed);
    }

    const items: Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> = [];
    const sortedNodes = Array.from(scopeByNode.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [nodeId, scope] of sortedNodes) {
      items.push({ nodeId, scope });
      if (scope !== 'perThread') continue;
      const threadIds = Array.from(threadIdsByNode.get(nodeId) ?? []).sort((a, b) => a.localeCompare(b));
      for (const threadId of threadIds) {
        items.push({ nodeId, scope, threadId });
      }
    }

    return { items };
  }

  @Get(':nodeId/:scope/list')
  async list(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ items: Array<{ name: string; kind: 'file'|'dir' }> }> {
    const { nodeId, scope } = params;
    const path = query.path ?? '/';
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    const items = await this.moduleRef.get(MemoryService, { strict: false }).list(nodeId, scope, threadId, path || '/');
    return { items };
  }

  @Get(':nodeId/:scope/stat')
  async stat(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ kind: 'file'|'dir'|'none'; size?: number }> {
    const { nodeId, scope } = params;
    const path = query.path;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    return this.moduleRef.get(MemoryService, { strict: false }).stat(nodeId, scope, threadId, path);
  }

  @Get(':nodeId/:scope/read')
  async read(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ content: string }> {
    const { nodeId, scope } = params;
    const path = query.path;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    try { const content = await this.moduleRef.get(MemoryService, { strict: false }).read(nodeId, scope, threadId, path); return { content }; }
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
    try { await this.moduleRef.get(MemoryService, { strict: false }).append(nodeId, scope, threadId, body.path, body.data); }
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
    try { const replaced = await this.moduleRef.get(MemoryService, { strict: false }).update(nodeId, scope, threadId, body.path, body.oldStr, body.newStr); return { replaced }; }
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
    await this.moduleRef.get(MemoryService, { strict: false }).ensureDir(nodeId, scope, threadId, body.path);
  }

  @Delete(':nodeId/:scope')
  async remove(@Param() params: DocParamsDto, @Query() query: PathWithThreadQueryDto): Promise<{ files: number; dirs: number }> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    return this.moduleRef.get(MemoryService, { strict: false }).delete(nodeId, scope, threadId, query.path);
  }

  @Get(':nodeId/:scope/dump')
  async dump(@Param() params: DocParamsDto, @Query() query: ThreadOnlyQueryDto): Promise<unknown> {
    const { nodeId, scope } = params;
    const threadId = this.resolveThreadId(scope, params.threadId, query.threadId);
    return this.moduleRef.get(MemoryService, { strict: false }).dump(nodeId, scope, threadId);
  }
}
