import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

import { Input } from '../Input';
import { Dropdown } from '../Dropdown';
import { BashInput } from '../BashInput';
import { Toggle } from '../Toggle';
import { AutocompleteInput, type AutocompleteOption } from '../AutocompleteInput';
import { IconButton } from '../IconButton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { NixRepoInstallSection } from '../nix/NixRepoInstallSection';
import { displayRepository } from '../nix/utils';

import type { EnvEditorProps } from './EnvEditor';
import { EnvEditor } from './EnvEditor';
import { FieldLabel } from './FieldLabel';
import { WORKSPACE_PLATFORM_OPTIONS } from './constants';
import type { WorkspaceFlakeRepo, WorkspaceNixPackage } from './types';
import { toNumberOrUndefined } from './utils';

interface WorkspaceNixProps {
  query: string;
  onQueryChange: (value: string) => void;
  fetchOptions: (query: string) => Promise<AutocompleteOption[]>;
  packages: WorkspaceNixPackage[];
  repoEntries: WorkspaceFlakeRepo[];
  versionOptions: Record<string, string[]>;
  versionLoading: Set<string>;
  resolutionLoading: Set<string>;
  errors: Record<string, string | null>;
  onSelectOption: (option: AutocompleteOption) => Promise<void> | void;
  onRemove: (index: number) => void;
  onVersionChange: (index: number, value: string) => Promise<void> | void;
  onRepoEntriesChange: (entries: WorkspaceFlakeRepo[]) => void;
}

interface WorkspaceSectionProps {
  image: string;
  platform?: string | null;
  onImageChange: (value: string) => void;
  onPlatformChange: (value: string) => void;
  initialScript: string;
  onInitialScriptChange: (value: string) => void;
  envEditorProps: EnvEditorProps;
  enableDinD: boolean;
  onEnableDinDChange: (value: boolean) => void;
  volumesEnabled: boolean;
  onVolumesEnabledChange: (value: boolean) => void;
  volumesMountPath: string;
  onVolumesMountPathChange: (value: string) => void;
  ttlSeconds?: number;
  onTtlChange: (value: number | undefined) => void;
  cpuLimit?: string;
  onCpuLimitChange: (value: string | undefined) => void;
  memoryLimit?: string;
  onMemoryLimitChange: (value: string | undefined) => void;
  nixProps: WorkspaceNixProps;
  nixOpen: boolean;
  onNixOpenChange: (open: boolean) => void;
}

export function WorkspaceSection({
  image,
  platform,
  onImageChange,
  onPlatformChange,
  initialScript,
  onInitialScriptChange,
  envEditorProps,
  enableDinD,
  onEnableDinDChange,
  volumesEnabled,
  onVolumesEnabledChange,
  volumesMountPath,
  onVolumesMountPathChange,
  ttlSeconds,
  onTtlChange,
  cpuLimit,
  onCpuLimitChange,
  memoryLimit,
  onMemoryLimitChange,
  nixProps,
  nixOpen,
  onNixOpenChange,
}: WorkspaceSectionProps) {
  const handleRepoAdd = (entry: WorkspaceFlakeRepo) => {
    const existingIndex = nixProps.repoEntries.findIndex(
      (current) => current.repository === entry.repository && current.attributePath === entry.attributePath,
    );
    if (existingIndex >= 0) {
      const next = [...nixProps.repoEntries];
      next[existingIndex] = entry;
      nixProps.onRepoEntriesChange(next);
    } else {
      nixProps.onRepoEntriesChange([...nixProps.repoEntries, entry]);
    }
  };

  const handleRepoRemove = (index: number) => {
    const next = nixProps.repoEntries.filter((_, idx) => idx !== index);
    nixProps.onRepoEntriesChange(next);
  };

  return (
    <>
      <section>
        <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Container</h3>
        <div className="space-y-4">
          <FieldLabel label="Image" hint="Docker image to use for the workspace" required />
          <Input
            placeholder="docker.io/library/ubuntu:latest"
            value={image}
            onChange={(event) => onImageChange(event.target.value)}
            size="sm"
          />
          <div>
            <FieldLabel label="Platform" hint="Target platform for the workspace" />
            <Dropdown
              options={WORKSPACE_PLATFORM_OPTIONS}
              value={platform ?? 'auto'}
              onValueChange={(value) => onPlatformChange(value)}
              size="sm"
            />
          </div>
          <div>
            <FieldLabel label="Initial Script" hint="Bash script to run when the workspace starts" />
            <BashInput
              rows={3}
              placeholder="echo 'Hello, World!'"
              value={initialScript}
              onChange={(event) => onInitialScriptChange(event.target.value)}
              size="sm"
            />
          </div>
        </div>
      </section>

      <EnvEditor {...envEditorProps} />

      <section>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[var(--agyn-dark)] font-semibold">Enable Docker-in-Docker</h3>
            <p className="text-xs text-[var(--agyn-gray)] mt-1">Allow the workspace to run Docker containers</p>
          </div>
          <Toggle label="" description="" checked={enableDinD} onCheckedChange={onEnableDinDChange} />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[var(--agyn-dark)] font-semibold">Enable Persistent Volume</h3>
            <p className="text-xs text-[var(--agyn-gray)] mt-1">Persist data across workspace restarts</p>
          </div>
          <Toggle label="" description="" checked={volumesEnabled} onCheckedChange={onVolumesEnabledChange} />
        </div>
        {volumesEnabled && (
          <div className="pl-4 border-l-2 border-[var(--agyn-border-default)]">
            <FieldLabel label="Mount Path" hint="Path in the workspace where the volume will be mounted" />
            <Input
              placeholder="/workspace"
              value={volumesMountPath}
              onChange={(event) => onVolumesMountPathChange(event.target.value)}
              size="sm"
            />
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[var(--agyn-dark)] mb-4 font-semibold">Limits</h3>
        <div className="space-y-4">
          <div>
            <FieldLabel label="CPU Limit" hint="Examples: 0.5 or 500m" />
            <Input
              placeholder="0.5 or 500m"
              value={cpuLimit ?? ''}
              onChange={(event) => {
                const rawValue = event.target.value;
                const normalized = rawValue.trim();
                onCpuLimitChange(normalized.length > 0 ? normalized : undefined);
              }}
              size="sm"
            />
          </div>
          <div>
            <FieldLabel label="Memory Limit" hint="Examples: 512Mi, 1Gi, 1024MB" />
            <Input
              placeholder="512Mi"
              value={memoryLimit ?? ''}
              onChange={(event) => {
                const rawValue = event.target.value;
                const normalized = rawValue.trim();
                onMemoryLimitChange(normalized.length > 0 ? normalized : undefined);
              }}
              size="sm"
            />
          </div>
          <div>
            <FieldLabel label="TTL" hint="Time-to-live for the workspace in seconds" />
            <Input
              type="number"
              placeholder="3600"
              value={ttlSeconds !== undefined ? String(ttlSeconds) : ''}
              onChange={(event) => onTtlChange(toNumberOrUndefined(event.target.value))}
              size="sm"
            />
          </div>
        </div>
      </section>

      <section>
        <Collapsible open={nixOpen} onOpenChange={onNixOpenChange}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
              <h3 className="text-[var(--agyn-dark)] font-semibold">Nix Packages</h3>
              {nixOpen ? (
                <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />
              )}
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-4">
              <AutocompleteInput
                value={nixProps.query}
                onChange={nixProps.onQueryChange}
                fetchOptions={nixProps.fetchOptions}
                placeholder="Search packages..."
                onSelect={async (option) => {
                  await nixProps.onSelectOption(option);
                }}
                debounceMs={300}
                clearable
                size="sm"
              />
              <NixRepoInstallSection onAdd={handleRepoAdd} />
              <div className="space-y-3">
                {nixProps.packages.map((pkg, index) => {
                  const versionList = nixProps.versionOptions[pkg.name] ?? [];
                  const loadingVersions = nixProps.versionLoading.has(pkg.name);
                  const resolving = nixProps.resolutionLoading.has(pkg.name);
                  const errorMessage = nixProps.errors[pkg.name];
                  return (
                    <div key={`${pkg.name}-${index}`}>
                      <FieldLabel label={pkg.name} />
                      <div className="flex items-center gap-2">
                        <Dropdown
                          options={versionList.map((version) => ({ value: version, label: version }))}
                          placeholder={
                            loadingVersions
                              ? 'Loading versions...'
                              : versionList.length === 0
                              ? 'No versions found'
                              : 'Select version'
                          }
                          value={pkg.version}
                          onValueChange={async (value) => {
                            await nixProps.onVersionChange(index, value);
                          }}
                          size="sm"
                          className="flex-1"
                          disabled={loadingVersions || resolving || versionList.length === 0}
                        />
                        <div className="w-[40px] flex items-center justify-center">
                          <IconButton
                            icon={<Trash2 className="w-4 h-4" />}
                            variant="ghost"
                            size="sm"
                            onClick={() => nixProps.onRemove(index)}
                            className="hover:text-[var(--agyn-status-failed)]"
                            disabled={resolving}
                          />
                        </div>
                      </div>
                      {errorMessage ? (
                        <div className="mt-1 text-xs text-[var(--agyn-status-failed)]">{errorMessage}</div>
                      ) : null}
                      {resolving ? (
                        <div className="mt-1 text-xs text-[var(--agyn-gray)]">Resolving selection…</div>
                      ) : null}
                      {pkg.commitHash && pkg.attributePath ? (
                        <div className="mt-1 text-[10px] text-[var(--agyn-gray)]">
                          {pkg.commitHash.slice(0, 12)} · {pkg.attributePath}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {nixProps.repoEntries.map((entry, index) => (
                  <WorkspaceRepoItem
                    key={`${entry.repository}|${entry.attributePath}`}
                    entry={entry}
                    onRemove={() => handleRepoRemove(index)}
                  />
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </section>
    </>
  );
}

function WorkspaceRepoItem({ entry, onRemove }: { entry: WorkspaceFlakeRepo; onRemove: () => void }) {
  const label = entry.attributePath;
  const repoLabel = displayRepository(entry.repository);
  const refSuffix = entry.ref ? `#${entry.ref}` : '';
  const commitShort = entry.commitHash.slice(0, 12);

  return (
    <div>
      <FieldLabel label={label} />
      <div className="flex items-center gap-2">
        <Input
          value={`${repoLabel}${refSuffix}`}
          readOnly
          size="sm"
          className="flex-1"
        />
        <div className="w-[40px] flex items-center justify-center">
          <IconButton
            icon={<Trash2 className="w-4 h-4" />}
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="hover:text-[var(--agyn-status-failed)]"
          />
        </div>
      </div>
      <div className="mt-1 text-[10px] text-[var(--agyn-gray)]">
        {commitShort} · {repoLabel}
        {refSuffix}
      </div>
    </div>
  );
}
