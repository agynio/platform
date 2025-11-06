import { Controller, Get, Headers, HttpException, HttpStatus, Inject, Param, Query } from '@nestjs/common';
import * as crypto from 'crypto';
import { VaultService } from '../vault/vault.service';
import { SecretsService } from './secrets.service';
import { SummaryQueryDto } from './dto/summary.query.dto';
import { ReadQueryDto } from './dto/read.query.dto';

@Controller('api/secrets')
export class SecretsController {
  constructor(
    @Inject(SecretsService) private readonly secrets: SecretsService,
    @Inject(VaultService) private readonly vault: VaultService,
  ) {}

  @Get('summary')
  async getSummary(@Query() q: SummaryQueryDto) {
    const pageNum = typeof q.page === 'string' ? Number(q.page) : (q.page as number | undefined);
    const pageSizeNum = typeof q.page_size === 'string' ? Number(q.page_size) : (q.page_size as number | undefined);
    return this.secrets.summarize({
      filter: (q.filter as any) || 'all',
      page: Number.isFinite(pageNum as number) ? (pageNum as number) : 1,
      pageSize: Number.isFinite(pageSizeNum as number) ? (pageSizeNum as number) : 50,
      mount: q.mount,
      pathPrefix: q.path_prefix,
    });
  }

  // Wildcard to allow slashes in :path
  @Get(':mount/*path/:key')
  async readSecret(
    @Param('mount') mount: string,
    @Param('path') path: string,
    @Param('key') key: string,
    @Query() q: ReadQueryDto,
    @Headers() headers?: Record<string, string>,
  ): Promise<{ ref: string; masked: boolean; value?: string; length?: number; status: 'present' | 'missing' | 'error'; error?: string }> {
    const ref = `${mount}/${path}/${key}`;
    const reveal = q?.reveal;
    const wantReveal = reveal === '1' || (reveal || '').toLowerCase() === 'true';
    if (wantReveal) {
      const allow = String(process.env.VAULT_READ_ALLOW_UNMASK || '').toLowerCase() === 'true';
      const expected = process.env.ADMIN_READ_TOKEN;
      const provided = (headers?.['x-admin-token'] as string) || (headers?.['X-Admin-Token'] as unknown as string);
      const ok = allow && expected && provided ? timingSafeEqual(String(provided), String(expected)) : false;
      if (!ok) throw new HttpException({ error: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
      try {
        const v = await this.vault.getSecret({ mount, path, key });
        if (v == null) return { ref, masked: false, status: 'missing' };
        // Do NOT log plaintext
        return { ref, masked: false, status: 'present', value: v };
      } catch {
        return { ref, masked: false, status: 'error', error: 'vault_error' };
      }
    }
    try {
      const v = await this.vault.getSecret({ mount, path, key });
      if (v == null) return { ref, masked: false, status: 'missing' };
      return { ref, masked: true, status: 'present', length: String(v).length };
    } catch {
      return { ref, masked: false, status: 'error', error: 'vault_error' };
    }
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return a === b;
  }
}
