import { useCallback, useEffect, useMemo, useState } from 'react';

import type { AutocompleteOption } from '../../AutocompleteInput';

import { WorkspaceSection } from '../WorkspaceSection';
import type { WorkspaceFlakeRepo, WorkspaceNixPackage } from '../types';
import type { NodePropertiesViewProps } from '../viewTypes';
import { useEnvEditorState } from '../hooks/useEnvEditorState';
import {
  applyNixUpdate,
  applyVolumesUpdate,
  isRecord,
  readNixFlakeRepos,
  readNixPackages,
  readNumber,
} from '../utils';

type VersionOptionsMap = Record<string, string[]>;

type WorkspaceNodeProps = NodePropertiesViewProps<'Workspace'>;

function WorkspaceNodeConfigContent({
  config,
  onConfigChange,
  nixPackageSearch,
  fetchNixPackageVersions,
  resolveNixPackageSelection,
  secretSuggestions,
  variableSuggestions,
  ensureSecretKeys,
  ensureVariableKeys,
}: WorkspaceNodeProps) {
  const configRecord = config as Record<string, unknown>;
  const image = typeof configRecord.image === 'string' ? (configRecord.image as string) : '';
  const platform = typeof configRecord.platform === 'string' ? (configRecord.platform as string) : '';
  const initialScript =
    typeof configRecord.initialScript === 'string' ? (configRecord.initialScript as string) : '';
  const enableDinD = configRecord.enableDinD === true;
  const cpuLimit =
    typeof configRecord.cpu_limit === 'string'
      ? (configRecord.cpu_limit as string)
      : typeof configRecord.cpu_limit === 'number'
      ? String(configRecord.cpu_limit)
      : undefined;
  const memoryLimit =
    typeof configRecord.memory_limit === 'string'
      ? (configRecord.memory_limit as string)
      : typeof configRecord.memory_limit === 'number'
      ? String(configRecord.memory_limit)
      : undefined;
  const ttlSeconds = readNumber(configRecord.ttlSeconds);

  const volumesConfig = isRecord(configRecord.volumes) ? (configRecord.volumes as Record<string, unknown>) : {};
  const volumesEnabled = volumesConfig.enabled === true;
  const volumesMountPath =
    typeof volumesConfig.mountPath === 'string' ? (volumesConfig.mountPath as string) : '/workspace';

  const envState = useEnvEditorState({
    configRecord,
    onConfigChange,
    ensureSecretKeys,
    ensureVariableKeys,
  });
  const {
    envVars,
    onAdd,
    onRemove,
    onNameChange,
    onValueChange,
    onValueFocus,
    onSourceTypeChange,
  } = envState;

  const workspaceNixPackages = useMemo<WorkspaceNixPackage[]>(
    () => readNixPackages(configRecord.nix),
    [configRecord.nix],
  );
  const workspaceFlakeRepos = useMemo<WorkspaceFlakeRepo[]>(
    () => readNixFlakeRepos(configRecord.nix),
    [configRecord.nix],
  );

  const [envOpen, setEnvOpen] = useState(true);
  const [nixOpen, setNixOpen] = useState(true);
  const [nixPackageQuery, setNixPackageQuery] = useState('');
  const [nixVersionOptions, setNixVersionOptions] = useState<VersionOptionsMap>({});
  const [nixVersionLoading, setNixVersionLoading] = useState<Set<string>>(() => new Set());
  const [nixResolutionLoading, setNixResolutionLoading] = useState<Set<string>>(() => new Set());
  const [nixErrors, setNixErrors] = useState<Record<string, string | null>>({});

  const envEditorProps = useMemo(
    () => ({
      title: 'Environment Variables',
      isOpen: envOpen,
      onOpenChange: setEnvOpen,
      envVars,
      onAdd,
      onRemove,
      onNameChange,
      onValueChange,
      onValueFocus,
      onSourceTypeChange,
      secretSuggestions,
      variableSuggestions,
    }),
    [envOpen, envVars, onAdd, onNameChange, onRemove, onSourceTypeChange, onValueChange, onValueFocus, secretSuggestions, variableSuggestions],
  );

  const setVersionLoading = useCallback((name: string, loading: boolean) => {
    setNixVersionLoading((prev) => {
      const next = new Set(prev);
      if (loading) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return next;
    });
  }, []);

  const setPackageResolving = useCallback((name: string, loading: boolean) => {
    setNixResolutionLoading((prev) => {
      const next = new Set(prev);
      if (loading) {
        next.add(name);
      } else {
        next.delete(name);
      }
      return next;
    });
  }, []);

  const fetchNixPackageOptions = useMemo(() => {
    if (!nixPackageSearch) {
      return async (_query: string): Promise<AutocompleteOption[]> => [];
    }
    return async (query: string): Promise<AutocompleteOption[]> => {
      try {
        const result = await nixPackageSearch(query);
        return Array.isArray(result) ? result : [];
      } catch {
        return [];
      }
    };
  }, [nixPackageSearch]);

  const clearPackageState = useCallback((name: string) => {
    setNixVersionOptions((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
    setNixErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const loadPackageVersions = useCallback(
    async (name: string) => {
      if (!fetchNixPackageVersions) {
        return;
      }
      if (nixVersionLoading.has(name)) return;
      setVersionLoading(name, true);
      try {
        const versions = await fetchNixPackageVersions(name);
        setNixVersionOptions((prev) => ({ ...prev, [name]: Array.isArray(versions) ? versions : [] }));
        setNixErrors((prev) => ({ ...prev, [name]: null }));
      } catch {
        setNixErrors((prev) => ({ ...prev, [name]: 'Failed to load versions' }));
      } finally {
        setVersionLoading(name, false);
      }
    },
    [fetchNixPackageVersions, nixVersionLoading, setVersionLoading],
  );

  useEffect(() => {
    if (!fetchNixPackageVersions) return;
    workspaceNixPackages.forEach((pkg) => {
      if (!nixVersionOptions[pkg.name]) {
        void loadPackageVersions(pkg.name);
      }
    });
  }, [workspaceNixPackages, fetchNixPackageVersions, loadPackageVersions, nixVersionOptions]);

  const handleVolumesEnabledChange = useCallback(
    (enabled: boolean) => {
      onConfigChange?.(applyVolumesUpdate(config, { enabled }));
    },
    [config, onConfigChange],
  );

  const handleVolumesMountPathChange = useCallback(
    (value: string) => {
      onConfigChange?.(applyVolumesUpdate(config, { mountPath: value }));
    },
    [config, onConfigChange],
  );

  const handleNixSelect = useCallback(
    async (option: AutocompleteOption) => {
      if (workspaceNixPackages.some((pkg) => pkg.name === option.value)) {
        setNixPackageQuery('');
        return;
      }
      const nextPackages: WorkspaceNixPackage[] = [
        ...workspaceNixPackages,
        {
          kind: 'nixpkgs',
          name: option.value,
          version: '',
          commitHash: '',
          attributePath: '',
        },
      ];
      onConfigChange?.(applyNixUpdate(config, nextPackages, workspaceFlakeRepos));
      setNixErrors((prev) => ({ ...prev, [option.value]: null }));
      setNixPackageQuery('');
      await loadPackageVersions(option.value);
    },
    [config, loadPackageVersions, onConfigChange, workspaceFlakeRepos, workspaceNixPackages],
  );

  const handleNixRemove = useCallback(
    (index: number) => {
      const pkg = workspaceNixPackages[index];
      if (!pkg) return;
      const next = workspaceNixPackages.filter((_, idx) => idx !== index);
      onConfigChange?.(applyNixUpdate(config, next, workspaceFlakeRepos));
      clearPackageState(pkg.name);
    },
    [clearPackageState, config, onConfigChange, workspaceFlakeRepos, workspaceNixPackages],
  );

  const handleNixVersionChange = useCallback(
    async (index: number, value: string) => {
      const pkg = workspaceNixPackages[index];
      if (!pkg) return;
      const staged = workspaceNixPackages.map((entry, idx) =>
        idx === index ? { ...entry, version: value, commitHash: '', attributePath: '' } : entry,
      );
      onConfigChange?.(applyNixUpdate(config, staged, workspaceFlakeRepos));

      if (!resolveNixPackageSelection) {
        return;
      }

      setPackageResolving(pkg.name, true);
      try {
        const resolved = await resolveNixPackageSelection(pkg.name, value);
        setNixErrors((prev) => ({ ...prev, [pkg.name]: null }));
        const nextResolved = staged.map((entry, idx) =>
          idx === index
            ? {
                ...entry,
                version: resolved.version,
                commitHash: resolved.commitHash,
                attributePath: resolved.attributePath,
              }
            : entry,
        );
        onConfigChange?.(applyNixUpdate(config, nextResolved, workspaceFlakeRepos));
      } catch {
        setNixErrors((prev) => ({ ...prev, [pkg.name]: 'Failed to resolve package' }));
      } finally {
        setPackageResolving(pkg.name, false);
      }
    },
    [config, resolveNixPackageSelection, setPackageResolving, workspaceFlakeRepos, workspaceNixPackages, onConfigChange],
  );

  const handleRepoPackagesChange = useCallback(
    (nextRepos: WorkspaceFlakeRepo[]) => {
      onConfigChange?.(applyNixUpdate(config, workspaceNixPackages, nextRepos));
    },
    [config, onConfigChange, workspaceNixPackages],
  );

  return (
    <WorkspaceSection
      image={image}
      platform={platform}
      onImageChange={(value) => onConfigChange?.({ image: value })}
      onPlatformChange={(value) => onConfigChange?.({ platform: value })}
      initialScript={initialScript}
      onInitialScriptChange={(value) => onConfigChange?.({ initialScript: value })}
      envEditorProps={envEditorProps}
      enableDinD={enableDinD}
      onEnableDinDChange={(checked) => onConfigChange?.({ enableDinD: checked })}
      volumesEnabled={volumesEnabled}
      onVolumesEnabledChange={handleVolumesEnabledChange}
      volumesMountPath={volumesMountPath}
      onVolumesMountPathChange={handleVolumesMountPathChange}
      cpuLimit={cpuLimit}
      onCpuLimitChange={(value) => onConfigChange?.({ cpu_limit: value })}
      memoryLimit={memoryLimit}
      onMemoryLimitChange={(value) => onConfigChange?.({ memory_limit: value })}
      ttlSeconds={ttlSeconds}
      onTtlChange={(value) => onConfigChange?.({ ttlSeconds: value })}
      nixProps={{
        query: nixPackageQuery,
        onQueryChange: setNixPackageQuery,
        fetchOptions: fetchNixPackageOptions,
        packages: workspaceNixPackages,
        repoEntries: workspaceFlakeRepos,
        versionOptions: nixVersionOptions,
        versionLoading: nixVersionLoading,
        resolutionLoading: nixResolutionLoading,
        errors: nixErrors,
        onSelectOption: handleNixSelect,
        onRemove: handleNixRemove,
        onVersionChange: handleNixVersionChange,
        onRepoEntriesChange: handleRepoPackagesChange,
      }}
      nixOpen={nixOpen}
      onNixOpenChange={setNixOpen}
    />
  );
}

export function WorkspaceNodeConfigView(props: NodePropertiesViewProps<'Workspace'>) {
  return <WorkspaceNodeConfigContent {...props} />;
}

export default WorkspaceNodeConfigView;
