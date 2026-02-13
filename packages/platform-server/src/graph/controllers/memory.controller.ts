import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { MemoryScope } from '../../nodes/memory/memory.types';
import { MemoryService } from '../../nodes/memory/memory.service';
import { AgentsPersistenceService } from '../../agents/agents.persistence.service';
import { CurrentPrincipal } from '../../auth/principal.decorator';
import type { Principal } from '../../auth/auth.types';

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
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(AgentsPersistenceService) private readonly persistence: AgentsPersistenceService,
  ) {}

  private requirePrincipal(principal: Principal | null): Principal {
    if (!principal) {
      throw new UnauthorizedException({ error: 'unauthorized' });
    }
    return principal;
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

  private async resolveAuthorizedThreadId(
    scope: MemoryScope,
    ownerUserId: string,
    ...candidates: Array<string | undefined>
  ): Promise<string | undefined> {
    if (scope !== 'perThread') return undefined;
    const threadId = this.resolveThreadId(scope, ...candidates);
    if (!threadId) {
      throw new HttpException({ error: 'threadId required for perThread scope' }, HttpStatus.BAD_REQUEST);
    }
    const thread = await this.persistence.getThreadById(threadId, { ownerUserId });
    if (!thread) {
      throw new NotFoundException({ error: 'thread_not_found' });
    }
    return threadId;
  }

  private async filterDocsForPrincipal(
    items: Array<{ nodeId: string; scope: MemoryScope; threadId?: string }>,
    ownerUserId: string,
  ): Promise<Array<{ nodeId: string; scope: MemoryScope; threadId?: string }>> {
    const cache = new Map<string, boolean>();
    const filtered: Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> = [];
    for (const item of items) {
      if (!item.threadId) {
        filtered.push(item);
        continue;
      }
      if (!cache.has(item.threadId)) {
        const thread = await this.persistence.getThreadById(item.threadId, { ownerUserId });
        cache.set(item.threadId, !!thread);
      }
      if (cache.get(item.threadId)) {
        filtered.push(item);
      }
    }
    return filtered;
  }

  @Get('docs')
  async listDocs(
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<{ items: Array<{ nodeId: string; scope: MemoryScope; threadId?: string }> }> {
    const currentPrincipal = this.requirePrincipal(principal);
    const ownerUserId = currentPrincipal.userId;
    const items = await this.memoryService.listDocs();
    const filtered = await this.filterDocsForPrincipal(items, ownerUserId);
    return { items: filtered };
  }

  @Get(':nodeId/:scope/list')
  async list(
    @Param() params: DocParamsDto,
    @Query() query: PathWithThreadQueryDto,
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<{ items: Array<{ name: string; hasSubdocs: boolean }> }> {
    const currentPrincipal = this.requirePrincipal(principal);
    const { nodeId, scope } = params;
    const path = query.path ?? '/';
    const threadId = await this.resolveAuthorizedThreadId(scope, currentPrincipal.userId, params.threadId, query.threadId);
    const items = await this.memoryService.list(nodeId, scope, threadId, path || '/');
    return { items };
  }

  @Get(':nodeId/:scope/stat')
  async stat(
    @Param() params: DocParamsDto,
    @Query() query: PathWithThreadQueryDto,
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<{ exists: boolean; hasSubdocs: boolean; contentLength: number }> {
    const currentPrincipal = this.requirePrincipal(principal);
    const { nodeId, scope } = params;
    const path = query.path;
    const threadId = await this.resolveAuthorizedThreadId(scope, currentPrincipal.userId, params.threadId, query.threadId);
    return this.memoryService.stat(nodeId, scope, threadId, path);
  }

  @Get(':nodeId/:scope/read')
  async read(
    @Param() params: DocParamsDto,
    @Query() query: PathWithThreadQueryDto,
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<{ content: string }> {
    const currentPrincipal = this.requirePrincipal(principal);
    const { nodeId, scope } = params;
    const path = query.path;
    const threadId = await this.resolveAuthorizedThreadId(scope, currentPrincipal.userId, params.threadId, query.threadId);
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
  async append(
    @Param() params: DocParamsDto,
    @Body() body: AppendBodyDto,
    @Query() query: ThreadOnlyQueryDto,
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<void> {
    const currentPrincipal = this.requirePrincipal(principal);
    const { nodeId, scope } = params;
    const threadId = await this.resolveAuthorizedThreadId(scope, currentPrincipal.userId, params.threadId, body.threadId, query.threadId);
    await this.memoryService.append(nodeId, scope, threadId, body.path, body.data);
  }

  @Post(':nodeId/:scope/update')
  async update(
    @Param() params: DocParamsDto,
    @Body() body: UpdateBodyDto,
    @Query() query: ThreadOnlyQueryDto,
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<{ replaced: number }> {
    const currentPrincipal = this.requirePrincipal(principal);
    const { nodeId, scope } = params;
    const threadId = await this.resolveAuthorizedThreadId(scope, currentPrincipal.userId, params.threadId, body.threadId, query.threadId);
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
  async ensureDir(
    @Param() params: DocParamsDto,
    @Body() body: EnsureDirBodyDto,
    @Query() query: ThreadOnlyQueryDto,
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<void> {
    const currentPrincipal = this.requirePrincipal(principal);
    const { nodeId, scope } = params;
    const threadId = await this.resolveAuthorizedThreadId(scope, currentPrincipal.userId, params.threadId, body.threadId, query.threadId);
    await this.memoryService.ensureDir(nodeId, scope, threadId, body.path);
  }

  @Delete(':nodeId/:scope')
  async remove(
    @Param() params: DocParamsDto,
    @Query() query: PathWithThreadQueryDto,
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<{ removed: number }> {
    const currentPrincipal = this.requirePrincipal(principal);
    const { nodeId, scope } = params;
    const threadId = await this.resolveAuthorizedThreadId(scope, currentPrincipal.userId, params.threadId, query.threadId);
    return this.memoryService.delete(nodeId, scope, threadId, query.path);
  }

  @Get(':nodeId/:scope/dump')
  async dump(
    @Param() params: DocParamsDto,
    @Query() query: ThreadOnlyQueryDto,
    @CurrentPrincipal() principal: Principal | null,
  ): Promise<unknown> {
    const currentPrincipal = this.requirePrincipal(principal);
    const { nodeId, scope } = params;
    const threadId = await this.resolveAuthorizedThreadId(scope, currentPrincipal.userId, params.threadId, query.threadId);
    return this.memoryService.dump(nodeId, scope, threadId);
  }
}
