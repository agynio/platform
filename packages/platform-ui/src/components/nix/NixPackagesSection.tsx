import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@agyn/ui';
import type { ContainerNixConfig, FlakeRepoSelection, NixPackageSelection } from './types';
import { useQuery } from '@tanstack/react-query';
import { fetchPackages, fetchVersions, resolvePackage, resolveRepo } from '@/api/modules/nix';
import { AxiosError, isAxiosError } from 'axios';

// Debounce helper
function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const REPO_ERROR_MESSAGES: Record<string, string> = {
  invalid_repository: 'Repository must be a GitHub owner/repo URL or shorthand.',
  repository_not_allowed: 'Repository is not allowed by server policy.',
  repo_not_found: 'Repository not found on GitHub.',
  ref_not_found: 'Branch, tag, or commit could not be resolved.',
  non_flake_repo: 'flake.nix not found in the repository at that ref.',
  unauthorized_private_repo: 'Configure a GitHub token to access this repository.',
  validation_error: 'Invalid repository, ref, or attribute.',
  github_error: 'GitHub API error while resolving repository.',
  timeout: 'Request timed out contacting GitHub.',
  server_error: 'Server error while resolving repository.',
};

function describeRepoError(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    const code = typeof data?.error === 'string' ? data.error : undefined;
    if (code && REPO_ERROR_MESSAGES[code]) return REPO_ERROR_MESSAGES[code];
    if (data?.message && typeof data.message === 'string') return data.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message || 'Failed to resolve repository.';
  return 'Failed to resolve repository.';
}

function isCancellationError(err: unknown): boolean {
  if (isAxiosError(err)) {
    if (err.code === AxiosError.ERR_CANCELED || err.code === 'ERR_CANCELED') return true;
    if (err.name === 'CanceledError') return true;
  }
  return err instanceof DOMException && err.name === 'AbortError';
}

function displayRepository(repository: string): string {
  return repository.replace(/^github:/i, '').replace(/\.git$/i, '');
}

type SelectedPkg = { name: string };

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
  const [repoForm, setRepoForm] = useState<{ repository: string; ref: string; attr: string }>({
    repository: '',
    ref: '',
    attr: '',
  });
  const [repoError, setRepoError] = useState<string | null>(null);
  const [repoSubmitting, setRepoSubmitting] = useState(false);
  const [repoUpdatingIndex, setRepoUpdatingIndex] = useState<number | null>(null);
  const repoResolveRef = useRef<AbortController | null>(null);
  const handleResolved = useCallback(
    (name: string, detail: { version: string; commitHash: string; attributePath: string }) => {
      setDetailsByName((prev) => ({ ...prev, [name]: detail }));
    },
    [],
  );
  const lastPushedJson = useRef<string>('');
  const lastPushedPackagesLen = useRef<number>(0);
  // Stable key of the packages array we most recently pushed upstream.
  const lastPushedPkgsKey = useRef<string>('');
  const isHydrating = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      repoResolveRef.current?.abort();
    };
  }, []);

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
      const candidate = entry as Partial<FlakeRepoSelection & NixpkgsSelection>;
      const kind = typeof candidate.kind === 'string' ? candidate.kind : undefined;
      if (kind === 'flakeRepo' || (typeof candidate.repository === 'string' && kind !== 'nixpkgs')) {
        const repository = typeof candidate.repository === 'string' ? candidate.repository : '';
        const commitHash = typeof candidate.commitHash === 'string' ? candidate.commitHash : '';
        const attributePath = typeof candidate.attributePath === 'string' ? candidate.attributePath : '';
        if (!repository || !commitHash || !attributePath) continue;
        const refValue = typeof candidate.ref === 'string' ? candidate.ref.trim() : '';
        nextRepos.push({
          kind: 'flakeRepo',
          repository,
          commitHash,
          attributePath,
          ...(refValue ? { ref: refValue } : {}),
        });
        continue;
      }
      const name = typeof candidate.name === 'string' ? candidate.name : '';
      if (!name) continue;
      const version = typeof candidate.version === 'string' ? candidate.version : '';
      const commitHash = typeof candidate.commitHash === 'string' ? candidate.commitHash : '';
      const attributePath = typeof candidate.attributePath === 'string' ? candidate.attributePath : '';
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

  const updateRepoForm = useCallback((field: 'repository' | 'ref' | 'attr', value: string) => {
    setRepoForm((prev) => ({ ...prev, [field]: value }));
    if (repoError) setRepoError(null);
  }, [repoError]);

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

  const handleRepoSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>) => {
      if (e) e.preventDefault();
      if (repoSubmitting) return;
      const repository = repoForm.repository.trim();
      const attr = repoForm.attr.trim();
      const ref = repoForm.ref.trim();
      if (!repository || !attr) {
        setRepoError('Repository and attribute are required.');
        return;
      }
      repoResolveRef.current?.abort();
      const ac = new AbortController();
      repoResolveRef.current = ac;
      setRepoSubmitting(true);
      setRepoError(null);
      try {
        const res = await resolveRepo(repository, attr, ref || undefined, ac.signal);
        const nextEntry: FlakeRepoSelection = {
          kind: 'flakeRepo',
          repository: res.repository,
          commitHash: res.commitHash,
          attributePath: res.attributePath,
          ...(res.ref ? { ref: res.ref } : {}),
        };
        setRepoPackages((prev) => {
          const idx = prev.findIndex(
            (item) =>
              item.repository === nextEntry.repository && item.attributePath === nextEntry.attributePath,
          );
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = nextEntry;
            return next;
          }
          return [...prev, nextEntry];
        });
        setRepoForm({ repository: '', ref: '', attr: '' });
      } catch (err) {
        if (!isCancellationError(err)) {
          setRepoError(describeRepoError(err));
        }
      } finally {
        setRepoSubmitting(false);
        if (repoResolveRef.current === ac) repoResolveRef.current = null;
      }
    },
    [repoSubmitting, repoForm, setRepoPackages],
  );

  const handleRepoRefresh = useCallback(
    async (index: number) => {
      const entry = repoPackages[index];
      if (!entry) return;
      if (repoUpdatingIndex !== null && repoUpdatingIndex !== index) return;
      repoResolveRef.current?.abort();
      const ac = new AbortController();
      repoResolveRef.current = ac;
      setRepoUpdatingIndex(index);
      setRepoError(null);
      try {
        const res = await resolveRepo(entry.repository, entry.attributePath, entry.ref, ac.signal);
        const nextEntry: FlakeRepoSelection = {
          kind: 'flakeRepo',
          repository: res.repository,
          commitHash: res.commitHash,
          attributePath: res.attributePath,
          ...(res.ref ? { ref: res.ref } : {}),
        };
        setRepoPackages((prev) => {
          const next = [...prev];
          next[index] = nextEntry;
          return next;
        });
      } catch (err) {
        if (!isCancellationError(err)) {
          setRepoError(describeRepoError(err));
        }
      } finally {
        if (repoResolveRef.current === ac) repoResolveRef.current = null;
        setRepoUpdatingIndex((curr) => (curr === index ? null : curr));
      }
    },
    [repoPackages, repoUpdatingIndex],
  );

  const handleRepoRemove = useCallback(
    (index: number) => {
      if (repoUpdatingIndex === index) {
        repoResolveRef.current?.abort();
        setRepoUpdatingIndex(null);
      }
      setRepoPackages((prev) => prev.filter((_, idx) => idx !== index));
    },
    [repoUpdatingIndex],
  );

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase text-muted-foreground">Nix Packages (beta)</div>
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

      {selected.length > 0 && (
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
        </ul>
      )}

      <div className="space-y-2 pt-4">
        <div className="text-[10px] uppercase text-muted-foreground">Custom GitHub flakes</div>
        <form className="flex flex-col gap-2 md:flex-row md:items-end" onSubmit={handleRepoSubmit}>
          <div className="flex-1">
            <Input
              value={repoForm.repository}
              onChange={(e) => updateRepoForm('repository', e.target.value)}
              placeholder="owner/repo or github:owner/repo"
              aria-label="GitHub repository"
              autoComplete="off"
            />
          </div>
          <div className="md:w-36">
            <Input
              value={repoForm.ref}
              onChange={(e) => updateRepoForm('ref', e.target.value)}
              placeholder="ref (optional)"
              aria-label="Git ref"
              autoComplete="off"
            />
          </div>
          <div className="md:w-64">
            <Input
              value={repoForm.attr}
              onChange={(e) => updateRepoForm('attr', e.target.value)}
              placeholder="flake attribute (e.g. packages.x86_64-linux.default)"
              aria-label="Flake attribute"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={repoSubmitting} className="md:w-28">
            {repoSubmitting ? 'Resolving…' : 'Install'}
          </Button>
        </form>
        {repoError && (
          <div className="text-xs text-destructive" aria-live="polite">
            {repoError}
          </div>
        )}

        {repoPackages.length > 0 && (
          <ul className="space-y-2" aria-label="Custom flake repositories">
            {repoPackages.map((entry, idx) => {
              const isUpdating = repoUpdatingIndex === idx;
              const disableUpdate = repoSubmitting || isUpdating;
              const disableRemove = repoSubmitting || isUpdating;
              const shortSha = entry.commitHash.slice(0, 12);
              return (
                <li key={`${entry.repository}|${entry.attributePath}`} className="rounded border border-border p-2">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1 text-xs">
                      <div className="font-mono text-sm">{displayRepository(entry.repository)}#{entry.attributePath}</div>
                      <div className="text-muted-foreground">
                        Commit {shortSha}
                        {entry.ref ? <span className="ml-2">(ref: {entry.ref})</span> : null}
                      </div>
                    </div>
                    <div className="flex gap-2 self-start md:self-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disableUpdate}
                        onClick={() => handleRepoRefresh(idx)}
                      >
                        {isUpdating ? 'Updating…' : 'Refresh'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disableRemove}
                        onClick={() => handleRepoRemove(idx)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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

// End of component file
