import { Controller, Get, HttpCode, Param, Post, Query, Body, UseGuards, HttpException, Inject } from '@nestjs/common';
import { VaultService } from './vault.service';
import { VaultEnabledGuard } from './vault-enabled.guard';
import { KvPathsQueryDto } from './dto/kv-paths.query.dto';
import { KvKeysQueryDto } from './dto/kv-keys.query.dto';
import { KvWriteDto } from './dto/kv-write.dto';

@UseGuards(VaultEnabledGuard)
@Controller('api/vault')
export class VaultController {
  constructor(@Inject(VaultService) private vaultService: VaultService) {}

  @Get('mounts')
  async getMounts(): Promise<{ items: string[] }> {
    const items = await this.vaultService.listKvV2Mounts();
    return { items };
  }

  @Get('kv/:mount/paths')
  async getPaths(@Param('mount') mount: string, @Query() query: KvPathsQueryDto): Promise<{ items: string[] }> {
    const items = await this.vaultService.listPaths(mount, query?.prefix || '');
    return { items };
  }

  @Get('kv/:mount/keys')
  async getKeys(@Param('mount') mount: string, @Query() query: KvKeysQueryDto): Promise<{ items: string[] }> {
    const items = await this.vaultService.listKeys(mount, query?.path || '');
    return { items };
  }

  @Post('kv/:mount/write')
  @HttpCode(201)
  async writeKv(
    @Param('mount') mount: string,
    @Body() body: KvWriteDto,
  ): Promise<{ mount: string; path: string; key: string; version: number } | { error: string }> {
    try {
      const { version } = await this.vaultService.setSecret({ mount, path: body.path, key: body.key }, body.value);
      return { mount, path: body.path, key: body.key, version };
    } catch (e: unknown) {
      const status = statusCodeFrom(e);
      const code = typeof status === 'number' && Number.isFinite(status) ? Number(status) : 500;
      throw new HttpException({ error: 'vault_write_failed' }, code);
    }
  }
}

function statusCodeFrom(e: unknown): number | undefined {
  if (e && typeof e === 'object') {
    const v = (e as { statusCode?: unknown }).statusCode;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}
