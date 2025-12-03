import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import type { ContainerNixConfig, FlakeRepoSelection, NixPackageSelection, NixpkgsSelection } from './types';
import { useQuery } from '@tanstack/react-query';
import { fetchPackages, fetchVersions, resolvePackage } from '@/api/modules/nix';
import { NixRepoInstallSection } from './NixRepoInstallSection';
import { displayRepository } from './utils';

// Debounce helper
function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type SelectedPkg = { name: string };

function isFlakeRepoCandidate(value: Partial<NixPackageSelection>): value is Partial<FlakeRepoSelection> {
  return (
    (typeof value.kind === 'string' && value.kind === 'flakeRepo') ||
    'repository' in value ||
    'commitHash' in value ||
    'attributePath' in value
  );
}

function isNixpkgsCandidate(value: Partial<NixPackageSelection>): value is Partial<NixpkgsSelection> {
  return (typeof value.kind === 'string' && value.kind === 'nixpkgs') || 'name' in value;
}

//

type ControlledProps = { value: NixPackageSelection[]; onChange: (next: NixPackageSelection[]) => void };
type ConfigWithNix = Record<string, unknown> & { nix?: ContainerNixConfig };
type UncontrolledProps = { config: ConfigWithNix; onUpdateConfig: (next: Record<string, unknown>) => void };

export function NixPackagesSection(props: ControlledProps | UncontrolledProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<SelectedPkg[]>([]);
  const [versionsByName, setVersionsByName] = useState<Record<string, string | ''>>({});
  const [detailsByName, setDetailsByName] = useState<Record<string, { version: string; commitHash: string; attributePath: string }>>({});
  const [repoPackages, setRepoPackages] = useState<FlakeRepoSelection[]>([]);
  const handleResolved = useCallback(
    (name: string, detail: { version: string; commitHash: string; attributePath: string }) => {
      setDetailsByName((prev) => ({ ...prev, [name]: detail }));
    },
    [],
  );
  const handleRepoAdd = useCallback((entry: FlakeRepoSelection) => {
    setRepoPackages((prev) => {
      const existingIndex = prev.findIndex(
        (current) => current.repository === entry.repository && current.attributePath === entry.attributePath,
      );
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = entry;
        return next;
      }
      return [...prev, entry];
    });
  }, []);
  const handleRepoRemove = useCallback((index: number) => {
    setRepoPackages((prev) => prev.filter((_, idx) => idx !== index));
  }, []);
  const lastPushedJson = useRef<string>('');
  const lastPushedPackagesLen = useRef<number>(0);
  // Stable key of the packages array we most recently pushed upstream.
  const lastPushedPkgsKey = useRef<string>('');
  const isHydrating = useRef<boolean>(false);

  // Initialize from existing config.nix.packages when mounting or when config changes externally
  const isControlled = (p: ControlledProps | UncontrolledProps): p is ControlledProps => 'value' in p && 'onChange' in p;
  const toStableKey = (arr: NixPackageSelection[] | undefined) => JSON.stringify(arr ?? []);
  // Stable discriminants derived from props to satisfy hooks deps
  const controlled = isControlled(props);
  const controlledValueKey = controlled ? toStableKey((props as ControlledProps).value) : '';
  const uncontrolledPkgsKey = controlled ? '' : toStableKey((props as UncontrolledProps).config.nix?.packages);
  useEffect(() => {
    const incoming: NixPackageSelection[] = controlled
      ? ((props as ControlledProps).value ?? [])
      : ((((props as UncontrolledProps).config as ConfigWithNix).nix?.packages) || []) as NixPackageSelection[];
    const incomingKey = toStableKey(incoming);
    if (incomingKey === lastPushedPkgsKey.current) return;

    isHydrating.current = true;

    const nextStandard: Array<{ name: string; version: string; commitHash: string; attributePath: string }> = [];
    const nextRepos: FlakeRepoSelection[] = [];

    for (const entry of incoming) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as Partial<NixPackageSelection>;
      const kind = typeof candidate.kind === 'string' ? candidate.kind : undefined;
      if (kind === 'flakeRepo' || (kind !== 'nixpkgs' && isFlakeRepoCandidate(candidate))) {
        const repoCandidate = candidate as Partial<FlakeRepoSelection>;
        const repository = typeof repoCandidate.repository === 'string' ? repoCandidate.repository : '';
        const commitHash = typeof repoCandidate.commitHash === 'string' ? repoCandidate.commitHash : '';
        const attributePath = typeof repoCandidate.attributePath === 'string' ? repoCandidate.attributePath : '';
        if (!repository || !commitHash || !attributePath) continue;
        const refValue = typeof repoCandidate.ref === 'string' ? repoCandidate.ref.trim() : '';
        nextRepos.push({
          kind: 'flakeRepo',
          repository,
          commitHash,
          attributePath,
          ...(refValue ? { ref: refValue } : {}),
        });
        continue;
      }
      if (!isNixpkgsCandidate(candidate)) continue;
      const pkgCandidate = candidate as Partial<NixpkgsSelection>;
      const name = typeof pkgCandidate.name === 'string' ? pkgCandidate.name : '';
      if (!name) continue;
      const version = typeof pkgCandidate.version === 'string' ? pkgCandidate.version : '';
      const commitHash = typeof pkgCandidate.commitHash === 'string' ? pkgCandidate.commitHash : '';
      const attributePath = typeof pkgCandidate.attributePath === 'string' ? pkgCandidate.attributePath : '';
      nextStandard.push({ name, version, commitHash, attributePath });
    }

    const nextSelected: SelectedPkg[] = nextStandard.map((p) => ({ name: p.name }));
    setSelected((prev) => {
      const prevKey = JSON.stringify(prev);
      const nextKey = JSON.stringify(nextSelected);
      return prevKey === nextKey ? prev : nextSelected;
    });

    const nextVersions: Record<string, string | ''> = {};
    nextStandard.forEach((p) => {
      if (p.version) nextVersions[p.name] = p.version;
    });
    setVersionsByName((prev) => (JSON.stringify(prev) === JSON.stringify(nextVersions) ? prev : nextVersions));

    const nextDetails: Record<string, { version: string; commitHash: string; attributePath: string }> = {};
    nextStandard.forEach((p) => {
      if (p.version && p.commitHash && p.attributePath) {
        nextDetails[p.name] = {
          version: p.version,
          commitHash: p.commitHash,
          attributePath: p.attributePath,
        };
      }
    });
    setDetailsByName((prev) => (JSON.stringify(prev) === JSON.stringify(nextDetails) ? prev : nextDetails));

    setRepoPackages((prev) => {
      const prevKey = JSON.stringify(prev);
      const nextKey = JSON.stringify(nextRepos);
      return prevKey === nextKey ? prev : nextRepos;
    });

    const hydratedPackages: NixPackageSelection[] = [
      ...nextStandard
        .filter((p) => p.version && p.commitHash && p.attributePath)
        .map((p) => ({
          kind: 'nixpkgs' as const,
          name: p.name,
          version: p.version,
          commitHash: p.commitHash,
          attributePath: p.attributePath,
        })),
      ...nextRepos,
    ];

    lastPushedPackagesLen.current = hydratedPackages.length;
    lastPushedPkgsKey.current = toStableKey(hydratedPackages);

    if (controlled) {
      lastPushedJson.current = JSON.stringify(hydratedPackages);
    } else {
      const conf = (props as UncontrolledProps).config as ConfigWithNix;
      const nextConfig: Record<string, unknown> = {
        ...conf,
        nix: { ...(conf.nix ?? {}), packages: hydratedPackages },
      };
      lastPushedJson.current = JSON.stringify(nextConfig);
    }
  }, [controlled, controlledValueKey, uncontrolledPkgsKey, props]);

  // Push updates into node config when selections/channels change
  useEffect(() => {
    const standardPackages = selected.flatMap((p) => {
      const d = detailsByName[p.name];
      return d && d.version && d.commitHash && d.attributePath
        ? [
            {
              kind: 'nixpkgs' as const,
              name: p.name,
              version: d.version,
              commitHash: d.commitHash,
              attributePath: d.attributePath,
            },
          ]
        : [];
    });
    const combined: NixPackageSelection[] = [...standardPackages, ...repoPackages];

    if (isHydrating.current) {
      const packagesKey = toStableKey(combined);
      if (packagesKey === lastPushedPkgsKey.current) {
        lastPushedPackagesLen.current = combined.length;
        isHydrating.current = false;
      }
      return;
    }

    if (combined.length === 0 && lastPushedPackagesLen.current === 0) {
      return;
    }

    if (controlled) {
      const json = JSON.stringify(combined);
      if (json !== lastPushedJson.current) {
        lastPushedJson.current = json;
        lastPushedPackagesLen.current = combined.length;
        lastPushedPkgsKey.current = toStableKey(combined);
        (props as ControlledProps).onChange(combined);
      }
    } else {
      const conf = (props as UncontrolledProps).config as ConfigWithNix;
      const next: Record<string, unknown> = {
        ...conf,
        nix: { ...(conf.nix ?? {}), packages: combined },
      };
      const json = JSON.stringify(next);
      if (json !== lastPushedJson.current) {
        lastPushedJson.current = json;
        lastPushedPackagesLen.current = combined.length;
        lastPushedPkgsKey.current = toStableKey(combined);
        (props as UncontrolledProps).onUpdateConfig(next);
      }
    }
  }, [selected, detailsByName, repoPackages, controlled, controlledValueKey, uncontrolledPkgsKey, props]);
  const listboxRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const debouncedQuery = useDebounced(query, 300);

  const qPkgs = useQuery({
    queryKey: ['nix', 'packages', debouncedQuery],
    queryFn: ({ signal }) => fetchPackages(debouncedQuery, signal),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 60_000,
  });

  const suggestions: { name: string; description?: string | null }[] = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.trim().length < 2) return [];
    const arr = qPkgs.data ?? [];
    const filtered = arr.filter((m) => !selected.some((s) => s.name === m.name));
    return filtered.slice(0, 20);
  }, [qPkgs.data, debouncedQuery, selected]);

  const isSearching = debouncedQuery.trim().length >= 2 && qPkgs.isFetching;

  useEffect(() => {
    const focused = document.activeElement === inputRef.current;
    setIsOpen((suggestions.length > 0 || isSearching) && focused);
    setActiveIndex(0);
  }, [suggestions.length, isSearching]);

  // Scroll active option into view when navigating
  useEffect(() => {
    if (!listboxRef.current) return;
    const el = listboxRef.current.querySelector(`#nix-opt-${activeIndex}`) as HTMLElement | null;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const addSelected = (item: { name: string }) => {
    setSelected((prev) => {
      if (prev.find((p) => p.name === item.name)) return prev;
      return [...prev, { name: item.name }];
    });
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeSelected = (name: string) => {
    setSelected((prev) => prev.filter((p) => p.name !== name));
    setVersionsByName((prev) => {
      const { [name]: _omit, ...rest } = prev;
      return rest;
    });
    setDetailsByName((prev) => {
      const { [name]: _d, ...rest } = prev;
      return rest;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = suggestions[activeIndex];
      if (item) addSelected(item);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase text-muted-foreground">Nix Packages (beta)</div>
      <div className="space-y-1">
        <div className="relative">
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(suggestions.length > 0 || isSearching)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            onKeyDown={onKeyDown}
            placeholder="Search Nix packages..."
            role="combobox"
            aria-expanded={isOpen}
            aria-controls="nix-search-listbox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-activedescendant={isOpen ? `nix-opt-${activeIndex}` : undefined}
            aria-label="Search Nix packages"
          />
          {isOpen && (
            <ul
            id="nix-search-listbox"
            role="listbox"
            ref={listboxRef}
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-input bg-popover text-sm shadow"
            aria-busy={qPkgs.isFetching ? 'true' : 'false'}
          >
            {qPkgs.isFetching && suggestions.length === 0 ? (
              <li className="px-2 py-1 text-muted-foreground" aria-disabled="true">Searching…</li>
            ) : suggestions.length === 0 ? (
              <li className="px-2 py-1 text-muted-foreground" aria-disabled="true">No results</li>
            ) : (
              suggestions.map((s, idx) => {
                const label = s.name;
                const active = idx === activeIndex;
                return (
                  <li
                    key={s.name}
                    id={`nix-opt-${idx}`}
                    role="option"
                    aria-selected={active}
                    className={`cursor-pointer px-2 py-1 ${active ? 'bg-accent text-accent-foreground' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addSelected(s)}
                  >
                    {label}
                  </li>
                );
              }))}
            </ul>
          )}
        </div>

        {(() => {
          const err = qPkgs.error as unknown;
          const isAbort = (e: unknown): boolean => e instanceof DOMException && (e as DOMException).name === 'AbortError';
          const showError = !!err && !isAbort(err);
          return showError ? (
            <div className="text-xs text-destructive" aria-live="polite">Error searching Nix packages. Please retry.</div>
          ) : null;
        })()}
        <NixRepoInstallSection onAdd={handleRepoAdd} />
      </div>

      {(selected.length > 0 || repoPackages.length > 0) && (
        <ul className="space-y-2" aria-label="Selected Nix packages">
          {selected.map((p) => (
            <SelectedPackageItem
              key={p.name}
              pkg={p}
              chosen={versionsByName[p.name] || ''}
              onChoose={(v) => setVersionsByName((prev) => ({ ...prev, [p.name]: v }))}
              onResolved={handleResolved}
              onRemove={() => removeSelected(p.name)}
            />
          ))}
          {repoPackages.map((entry, index) => (
            <RepoPackageItem
              key={`${entry.repository}|${entry.attributePath}`}
              entry={entry}
              onRemove={() => handleRepoRemove(index)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// Bubble updates to config when either selection list or channels change
// Done outside of return to avoid re-creating effect per SelectedPackageItem
// Compute and push updated config.nix.packages
// Note: debounce not required; builder autosave already debounces
export default NixPackagesSection;

function SelectedPackageItem({ pkg, chosen, onChoose, onRemove, onResolved }: { pkg: { name: string }; chosen: string | ''; onChoose: (v: string | '') => void; onRemove: () => void; onResolved: (name: string, detail: { version: string; commitHash: string; attributePath: string }) => void }) {
  const qVersions = useQuery({
    queryKey: ['nix', 'versions', pkg.name],
    queryFn: ({ signal }) => fetchVersions(pkg.name, signal),
    staleTime: 5 * 60_000,
  });

  const label = pkg.name;
  const versions = useMemo(() => qVersions.data || [], [qVersions.data]);
  const versionOptions = useMemo(() => {
    if (!chosen) return versions;
    return versions.includes(chosen) ? versions : [chosen, ...versions];
  }, [versions, chosen]);

  // Optional: auto-select only when there is a single version available
  useEffect(() => {
    if (!chosen && versions.length === 1) {
      onChoose(versions[0]);
    }
  }, [chosen, versions, onChoose]);

  // Resolve selected version -> commitHash/attributePath with cancellation to avoid races
  const resolveRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      // Cancel in-flight on unmount
      resolveRef.current?.abort();
    };
  }, []);

  const onChangeVersion = useCallback(async (v: string) => {
    onChoose(v);
    // Cancel previous resolve
    resolveRef.current?.abort();
    if (!v) return;
    const ac = new AbortController();
    resolveRef.current = ac;
    try {
      const res = await resolvePackage(pkg.name, v, ac.signal);
      // Only apply if not aborted
      if (!ac.signal.aborted) {
        onResolved(pkg.name, { version: res.version, commitHash: res.commitHash, attributePath: res.attributePath });
      }
    } catch (_e) {
      // swallow errors; UI will not push unresolved entries
    } finally {
      if (resolveRef.current === ac) resolveRef.current = null;
    }
  }, [onChoose, onResolved, pkg.name]);

  return (
    <li className="flex items-center gap-2">
      <span className="flex-1 text-sm">{label}</span>
      <select
        aria-label={`Select version for ${label}`}
        className="rounded border border-input bg-background px-2 py-1 text-sm"
        value={chosen}
        onChange={(e) => onChangeVersion(e.target.value)}
      >
        <option value="">Select version…</option>
        {qVersions.isLoading ? (
          <option value="" disabled>loading…</option>
        ) : qVersions.isError ? (
          <option value="" disabled>error</option>
        ) : versionOptions.length === 0 ? (
          <option value="" disabled>n/a</option>
        ) : (
          versionOptions.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))
        )}
      </select>
      <Button type="button" size="sm" variant="outline" className="text-destructive" aria-label={`Remove ${label}`} onClick={onRemove}>
        ×
      </Button>
    </li>
  );
}

function RepoPackageItem({ entry, onRemove }: { entry: FlakeRepoSelection; onRemove: () => void }) {
  const label = entry.attributePath;
  const repoLabel = displayRepository(entry.repository);
  const refSuffix = entry.ref ? `#${entry.ref}` : '';
  const optionLabel = `${repoLabel}${refSuffix}`;
  const commitShort = entry.commitHash.slice(0, 12);

  return (
    <li className="flex items-center gap-2">
      <span
        className="flex-1 text-sm"
        title={`${repoLabel}${refSuffix ? ` ${refSuffix}` : ''} · ${entry.commitHash}`}
      >
        {label}
      </span>
      <select
        aria-label={`${label} source`}
        className="rounded border border-input bg-background px-2 py-1 text-sm"
        value={optionLabel}
        disabled
      >
        <option value={optionLabel}>{`${optionLabel} · ${commitShort}`}</option>
      </select>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-destructive"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        ×
      </Button>
    </li>
  );
}

// End of component file
