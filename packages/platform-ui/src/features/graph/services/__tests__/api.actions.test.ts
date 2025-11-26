import { describe, it, expect, vi, beforeEach } from 'vitest';

import { graphApiService } from '../api';

const apiMocks = vi.hoisted(() => ({
  getFullGraph: vi.fn(),
  saveFullGraph: vi.fn(),
  getTemplates: vi.fn(),
  getNodeStatus: vi.fn(),
  getNodeState: vi.fn(),
  putNodeState: vi.fn(),
  listVaultMounts: vi.fn(),
  listVaultPaths: vi.fn(),
  listVaultKeys: vi.fn(),
  postNodeAction: vi.fn(),
}));

vi.mock('@/api/modules/graph', () => ({
  graph: apiMocks,
}));

vi.mock('@/api/modules/nix', () => ({
  fetchPackages: vi.fn(),
  fetchVersions: vi.fn(),
  resolvePackage: vi.fn(),
}));

describe('graphApiService node actions', () => {
  beforeEach(() => {
    apiMocks.postNodeAction.mockClear();
  });

  it('provisionNode delegates to postNodeAction', async () => {
    apiMocks.postNodeAction.mockResolvedValueOnce(undefined);

    await graphApiService.provisionNode('node-123');

    expect(apiMocks.postNodeAction).toHaveBeenCalledWith('node-123', 'provision');
  });

  it('deprovisionNode delegates to postNodeAction', async () => {
    apiMocks.postNodeAction.mockResolvedValueOnce(undefined);

    await graphApiService.deprovisionNode('node-456');

    expect(apiMocks.postNodeAction).toHaveBeenCalledWith('node-456', 'deprovision');
  });
});
