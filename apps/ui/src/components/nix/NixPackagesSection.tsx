import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@hautech/ui';
import type { ContainerNixConfig, NixPackageSelection } from './types';
import { useQuery } from '@tanstack/react-query';
import { fetchPackages, fetchVersions, fetchPackageInfo, type PackageInfoResponse } from '@/services/nix';

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
  const [metaByName, setMetaByName] = useState<Record<string, PackageInfoResponse | undefined>>({});
  const lastPushedJson = useRef<string>('');
  const lastPushedPackagesLen = useRef<number>(0);

  // Initialize from existing config.nix.packages when mounting or when config changes externally
  const isControlled = (p: ControlledProps | UncontrolledProps): p is ControlledProps => 'value' in p && 'onChange' in p;
  const toStableKey = (arr: NixPackageSelection[] | undefined) => JSON.stringify(arr ?? []);
  // Stable discriminants derived from props to satisfy hooks deps
  const controlled = isControlled(props);
  const controlledValueKey = controlled ? toStableKey((props as ControlledProps).value) : '';
  const uncontrolledPkgsKey = controlled ? '' : toStableKey((props as UncontrolledProps).config.nix?.packages);
  useEffect(() => {
    if (controlled) {
      const curr = (((props as ControlledProps).value) || []).filter((p) => p && typeof p.name === 'string');
      const nextSelected: SelectedPkg[] = curr.map((p) => ({ name: p.name }));
      setSelected((prev) => {
        const prevKey = JSON.stringify(prev);
        const nextKey = JSON.stringify(nextSelected);
        return prevKey === nextKey ? prev : nextSelected;
      });
      setVersionsByName((prev) => {
        const next: Record<string, string | ''> = { ...prev };
        for (const p of curr) if (p.version) next[p.name] = p.version || '';
        return next;
      });
    } else {
      const conf = (props as UncontrolledProps).config as ConfigWithNix;
      const rawPkgs = conf.nix?.packages ?? [];
      const curr = (rawPkgs as NixPackageSelection[]).filter((p) => p && typeof p.name === 'string');
      const nextSelected: SelectedPkg[] = curr.map((p) => ({ name: p.name }));
      setSelected((prev) => {
        const prevKey = JSON.stringify(prev);
        const nextKey = JSON.stringify(nextSelected);
        return prevKey === nextKey ? prev : nextSelected;
      });
      setVersionsByName((prev) => {
        const next: Record<string, string | ''> = { ...prev };
        for (const p of curr) if (p.version) next[p.name] = p.version || '';
        return next;
      });
    }
  }, [controlled, controlledValueKey, uncontrolledPkgsKey]);

  // Push updates into node config when selections/channels change
  useEffect(() => {
    // Build packages array only for items with a chosen version
    const packages = selected.flatMap((p) => {
      const v = versionsByName[p.name];
      if (!v || v.length === 0) return [];
      const info = metaByName[p.name];
      let attribute_path: string | undefined;
      let commit_hash: string | undefined;
      if (info && Array.isArray(info.releases)) {
        const candidates = info.releases.filter((r) => r.version === v);
        const currentPlatform = '';
        let chosen = candidates[0];
        if (candidates.length > 1 && currentPlatform) {
          const match = candidates.find((r) => (r.platforms || []).includes(currentPlatform));
          if (match) chosen = match;
        }
        if (chosen) {
          attribute_path = chosen.attribute_path;
          commit_hash = chosen.commit_hash;
        }
      }
      return [{ name: p.name, version: v, attribute_path, commit_hash }];
    });
    // No debug logs in production

    // Skip no-op early pushes when there are no chosen versions and nothing was previously pushed
    if (packages.length === 0 && lastPushedPackagesLen.current === 0) {
      return;
    }

    if (controlled) {
      const next: NixPackageSelection[] = packages;
      // Avoid reentrancy loops; compare shallow JSON
      const json = JSON.stringify(next);
      if (json !== lastPushedJson.current) {
        lastPushedJson.current = json;
        lastPushedPackagesLen.current = packages.length;
        (props as ControlledProps).onChange(next);
      }
    } else {
      const conf = (props as UncontrolledProps).config as ConfigWithNix;
      const next: Record<string, unknown> = {
        ...conf,
        nix: { ...(conf.nix ?? {}), packages },
      };
      const json = JSON.stringify(next);
      if (json !== lastPushedJson.current) {
        lastPushedJson.current = json;
        lastPushedPackagesLen.current = packages.length;
        (props as UncontrolledProps).onUpdateConfig(next);
      }
    }
  }, [selected, versionsByName, controlled, controlledValueKey, uncontrolledPkgsKey]);
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
              onRemove={() => removeSelected(p.name)}
              onVersionListReady={() => {
                if (!metaByName[p.name]) {
                  void fetchPackageInfo(p.name)
                    .then((res) => setMetaByName((prev) => ({ ...prev, [p.name]: res })))
                    .catch(() => {});
                }
              }}
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

function SelectedPackageItem({ pkg, chosen, onChoose, onRemove, onVersionListReady }: { pkg: { name: string }; chosen: string | ''; onChoose: (v: string | '') => void; onRemove: () => void; onVersionListReady?: () => void }) {
  const qVersions = useQuery({
    queryKey: ['nix', 'versions', pkg.name],
    queryFn: ({ signal }) => fetchVersions(pkg.name, signal),
    staleTime: 5 * 60_000,
  });

  const label = pkg.name;
  const versions = qVersions.data || [];
  useEffect(() => { if (versions.length > 0) onVersionListReady?.(); }, [versions.length]);

  // Optional: auto-select only when there is a single version available
  useEffect(() => {
    if (!chosen && versions.length === 1) {
      onChoose(versions[0]);
    }
  }, [chosen, versions]);

  return (
    <li className="flex items-center gap-2">
      <span className="flex-1 text-sm">{label}</span>
      <select
        aria-label={`Select version for ${label}`}
        className="rounded border border-input bg-background px-2 py-1 text-sm"
        value={chosen}
        onChange={(e) => {
          onChoose(e.target.value);
        }}
      >
        <option value="">Select version…</option>
        {qVersions.isLoading ? (
          <option value="" disabled>loading…</option>
        ) : qVersions.isError ? (
          <option value="" disabled>error</option>
        ) : versions.length === 0 ? (
          <option value="" disabled>n/a</option>
        ) : (
          versions.map((v) => (
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
