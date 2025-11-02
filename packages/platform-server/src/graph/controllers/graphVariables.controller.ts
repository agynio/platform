import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Post, Put } from '@nestjs/common';
import { GraphVariablesService, VarItem } from '../services/graphVariables.service';
type CreateBody = { key: string; graph: string };
type UpdateBody = { graph?: string | null; local?: string | null };

@Controller('api/graph/variables')
export class GraphVariablesController {
  constructor(@Inject(GraphVariablesService) private readonly service: GraphVariablesService) {}

  @Get()
  async list(): Promise<{ items: VarItem[] }> { return this.service.list('main'); }

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown): Promise<{ key: string; graph: string }> {
    const parsed = parseCreateBody(body);
    try { return await this.service.create('main', parsed.key, parsed.graph); }
    catch (e: unknown) {
      if (isCodeError(e) && e.code === 'DUPLICATE_KEY') throw new HttpException({ error: 'DUPLICATE_KEY' }, HttpStatus.CONFLICT);
      if (isCodeError(e) && e.code === 'VERSION_CONFLICT') throw new HttpException({ error: 'VERSION_CONFLICT', current: e.current }, HttpStatus.CONFLICT);
      throw e;
    }
  }

  @Put(':key')
  async update(@Param('key') key: string, @Body() body: unknown): Promise<{ key: string; graph?: string | null; local?: string | null }> {
    const parsed = parseUpdateBody(body);
    try { return await this.service.update('main', key, parsed); }
    catch (e: unknown) {
      if (isCodeError(e) && e.code === 'GRAPH_NOT_FOUND') throw new HttpException({ error: 'GRAPH_NOT_FOUND' }, HttpStatus.NOT_FOUND);
      if (isCodeError(e) && e.code === 'KEY_NOT_FOUND') throw new HttpException({ error: 'KEY_NOT_FOUND' }, HttpStatus.NOT_FOUND);
      if (isCodeError(e) && e.code === 'VERSION_CONFLICT') throw new HttpException({ error: 'VERSION_CONFLICT', current: e.current }, HttpStatus.CONFLICT);
      throw e;
    }
  }

  @Delete(':key')
  @HttpCode(204)
  async remove(@Param('key') key: string): Promise<void> {
    try { await this.service.remove('main', key); }
    catch (e: unknown) {
      if (isCodeError(e) && e.code === 'VERSION_CONFLICT') throw new HttpException({ error: 'VERSION_CONFLICT', current: e.current }, HttpStatus.CONFLICT);
      throw e;
    }
  }

  private prisma(): PrismaClient {
    return this.prismaService.getClient();
  }
}

function isCodeError(e: unknown): e is { code?: string; current?: unknown } {
  return !!e && typeof e === 'object' && 'code' in e;
}

function parseCreateBody(body: unknown): CreateBody {
  if (!body || typeof body !== 'object') throw new HttpException({ error: 'BAD_SCHEMA' }, HttpStatus.BAD_REQUEST);
  const obj = body as Record<string, unknown>;
  const keyRaw = obj['key'];
  const graphRaw = obj['graph'];
  if (typeof keyRaw !== 'string') throw new HttpException({ error: 'BAD_KEY' }, HttpStatus.BAD_REQUEST);
  if (typeof graphRaw !== 'string') throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
  const key = keyRaw.trim();
  const graph = graphRaw.trim();
  if (!key) throw new HttpException({ error: 'BAD_KEY' }, HttpStatus.BAD_REQUEST);
  if (!graph) throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
  return { key, graph };
}

function parseUpdateBody(body: unknown): UpdateBody {
  if (!body || typeof body !== 'object') throw new HttpException({ error: 'BAD_SCHEMA' }, HttpStatus.BAD_REQUEST);
  const obj = body as Record<string, unknown>;
  const out: { graph?: string | null; local?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(obj, 'graph')) {
    const v = obj['graph'];
    if (v == null) throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
    if (typeof v !== 'string') throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
    const trimmed = v.trim();
    if (!trimmed) throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
    out.graph = trimmed;
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'local')) {
    const v = obj['local'];
    if (v == null) { out.local = null; }
    else if (typeof v === 'string') { out.local = v; }
    else throw new HttpException({ error: 'BAD_VALUE' }, HttpStatus.BAD_REQUEST);
  }
  return out;
}
