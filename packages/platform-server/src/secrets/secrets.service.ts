import { Inject, Injectable } from '@nestjs/common';
import { GraphRepository } from '../graph/graph.repository';
import { VaultService } from '../vault/vault.service';
import { LoggerService } from '../core/services/logger.service';
import { parseVaultRef } from '../utils/refs';

export type SecretItem = {
  ref: string;
  mount?: string;
  path?: string;
  key?: string;
  status: 'used_present' | 'used_missing' | 'present_unused' | 'invalid_ref';
};

@Injectable()
export class SecretsService {
  constructor(
    @Inject(GraphRepository) private readonly graphs: GraphRepository,
    @Inject(VaultService) private readonly vault: VaultService,
    @Inject(LoggerService) private readonly logger: LoggerService,
  ) {}

  private async getCurrentGraph(): Promise<{ nodes: Array<{ config?: Record<string, unknown> }> } | null> {
    try {
      // Follow GraphPersistController single-graph model
      const g = await this.graphs.get('main');
      return (g as unknown) as { nodes: Array<{ config?: Record<string, unknown> }> } | null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.debug('SecretsService: getCurrentGraph failed: %s', msg);
      return null;
    }
  }

  private collectRefsFromConfig(obj: unknown): {
    valid: Array<{ ref: string; mount: string; path: string; key: string }>;
    invalid: string[];
  } {
    const valid: Array<{ ref: string; mount: string; path: string; key: string }> = [];
    const invalid: string[] = [];
    const visit = (o: unknown) => {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o)) {
        for (const it of o) visit(it);
        return;
      }
      const rec = o as Record<string, unknown>;
      const src = rec['source'];
      const val = rec['value'];
      if (src === 'vault' && typeof val === 'string') {
        const refStr = val as string;
        try {
          const p = parseVaultRef(refStr);
          valid.push({ ref: `${p.mount}/${p.path}/${p.key}`, mount: p.mount, path: p.path, key: p.key });
        } catch {
          invalid.push(refStr);
        }
      }
      for (const v of Object.values(rec)) visit(v);
    };
    visit(obj);
    const dedupValid = new Map<string, { ref: string; mount: string; path: string; key: string }>();
    for (const r of valid) if (!dedupValid.has(r.ref)) dedupValid.set(r.ref, r);
    const vOut = Array.from(dedupValid.values());
    const iOut = Array.from(new Set(invalid));
    return { valid: vOut, invalid: iOut };
  }

  async summarize(opts: {
    filter?: 'used' | 'missing' | 'all';
    page: number;
    pageSize: number;
    mount?: string;
    pathPrefix?: string;
  }): Promise<{
    items: SecretItem[];
    page: number;
    page_size: number;
    total: number;
    summary: { counts: { used_present: number; used_missing: number; present_unused: number; invalid_ref: number } };
  }> {
    const graph = await this.getCurrentGraph();
    const allRefs: Array<{ ref: string; mount: string; path: string; key: string }> = [];
    const invalid: string[] = [];
    for (const n of graph?.nodes || []) {
      const { valid, invalid: inv } = this.collectRefsFromConfig(n.config || {});
      allRefs.push(...valid);
      invalid.push(...inv);
    }
    const refMap = new Map<string, { mount: string; path: string; key: string }>();
    for (const r of allRefs) if (!refMap.has(r.ref)) refMap.set(r.ref, { mount: r.mount, path: r.path, key: r.key });

    const pairs = new Map<string, { mount: string; path: string }>();
    for (const { mount, path } of refMap.values()) pairs.set(`${mount}@@${path}`, { mount, path });

    const mountFilter = (opts.mount || '').trim() || undefined;
    const pathPrefix = (opts.pathPrefix || '').trim() || undefined;
    const within = (m: string, p: string) => {
      if (mountFilter && m !== mountFilter) return false;
      if (pathPrefix && !p.startsWith(pathPrefix)) return false;
      return true;
    };

    const present = new Map<string, Set<string>>(); // pair -> keys
    for (const pair of pairs.values()) {
      if (!within(pair.mount, pair.path)) continue;
      const keys = await this.vault.listKeys(pair.mount, pair.path);
      present.set(`${pair.mount}@@${pair.path}`, new Set(keys));
    }

    const items: SecretItem[] = [];
    let used_present = 0;
    let used_missing = 0;
    let present_unused = 0;
    const invalid_ref = invalid.length;

    for (const [ref, { mount, path, key }] of refMap.entries()) {
      if (!within(mount, path)) continue;
      const set = present.get(`${mount}@@${path}`);
      if (set && set.has(key)) {
        items.push({ ref, mount, path, key, status: 'used_present' });
        used_present++;
      } else {
        items.push({ ref, mount, path, key, status: 'used_missing' });
        used_missing++;
      }
    }

    for (const [pair, set] of present.entries()) {
      const [m, p] = pair.split('@@');
      const usedForPair = new Set<string>();
      for (const [, r] of refMap.entries()) if (r.mount === m && r.path === p) usedForPair.add(r.key);
      for (const k of set.values()) if (!usedForPair.has(k)) {
        items.push({ ref: `${m}/${p}/${k}`, mount: m, path: p, key: k, status: 'present_unused' });
        present_unused++;
      }
    }

    const invalidItems: SecretItem[] = invalid.map((r) => ({ ref: r, status: 'invalid_ref' } as SecretItem));

    const filter = opts.filter || 'all';
    let filtered = items;
    if (filter === 'used') filtered = items.filter((it) => it.status === 'used_present' || it.status === 'used_missing');
    else if (filter === 'missing') filtered = items.filter((it) => it.status === 'used_missing');
    if (filter === 'all') filtered = [...filtered, ...invalidItems];

    filtered.sort((a, b) => {
      const am = a.mount || '';
      const bm = b.mount || '';
      if (am !== bm) return am.localeCompare(bm);
      const ap = a.path || '';
      const bp = b.path || '';
      if (ap !== bp) return ap.localeCompare(bp);
      const ak = a.key || '';
      const bk = b.key || '';
      if (ak !== bk) return ak.localeCompare(bk);
      return a.status.localeCompare(b.status);
    });

    const total = filtered.length;
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(1000, Math.max(1, opts.pageSize || 50));
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paged = filtered.slice(start, end);

    return {
      items: paged,
      page,
      page_size: pageSize,
      total,
      summary: { counts: { used_present, used_missing, present_unused, invalid_ref } },
    };
  }
}
