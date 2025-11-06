import { http } from '@/api/http';

export type SummaryItem = { ref: string; mount?: string; path?: string; key?: string; status: 'used_present' | 'used_missing' | 'present_unused' | 'invalid_ref' };
export type SummaryResp = { items: SummaryItem[]; page: number; page_size: number; total: number; summary: { counts: { used_present: number; used_missing: number; present_unused: number; invalid_ref: number } } };

export const secretsApi = {
  getSummary: (params: { filter?: 'used' | 'missing' | 'all'; page?: number; page_size?: number; mount?: string; path_prefix?: string }) =>
    http.get<SummaryResp>('/api/secrets/summary', { params }),
  read: (mount: string, path: string, key: string, opts?: { reveal?: boolean; adminToken?: string }) =>
    http.get<{ ref: string; masked: boolean; value?: string; length?: number; status: 'present' | 'missing' | 'error'; error?: string }>(
      `/api/secrets/${encodeURIComponent(mount)}/${path}/${encodeURIComponent(key)}`,
      { params: { reveal: opts?.reveal ? '1' : undefined }, headers: opts?.adminToken ? { 'X-Admin-Token': opts.adminToken } : undefined },
    ),
};
