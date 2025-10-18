import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input } from '@hautech/ui';
import type { ContainerNixConfig, NixPackageSelection } from './types';
import { useQuery } from '@tanstack/react-query';
import type { NixChannel, NixSearchItem } from '@/services/nix';
import { CHANNELS, fetchPackageVersion, mergeChannelSearchResults, searchPackages } from '@/services/nix';

// Debounce helper
function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type SelectedPkg = {
  attr: string;
  pname?: string;
};

//

type ControlledProps = { value: NixPackageSelection[]; onChange: (next: NixPackageSelection[]) => void };
type ConfigWithNix = Record<string, unknown> & { nix?: ContainerNixConfig };
type UncontrolledProps = { config: ConfigWithNix; onUpdateConfig: (next: Record<string, unknown>) => void };

export function NixPackagesSection(props: ControlledProps | UncontrolledProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<SelectedPkg[]>([]);
  // Track chosen channel per attr
  const [channelsByAttr, setChannelsByAttr] = useState<Record<string, NixChannel | ''>>({});
  const lastPushedJson = useRef<string>('');

  // Initialize from existing config.nix.packages when mounting or when config changes externally
  const isControlled = (p: ControlledProps | UncontrolledProps): p is ControlledProps => 'value' in p && 'onChange' in p;
  const toStableKey = (arr: NixPackageSelection[] | undefined) => JSON.stringify(arr ?? []);
  // Stable discriminants derived from props to satisfy hooks deps
  const controlled = isControlled(props);
  const controlledValueKey = controlled ? toStableKey((props as ControlledProps).value) : '';
  const uncontrolledPkgsKey = controlled ? '' : toStableKey((props as UncontrolledProps).config.nix?.packages);
  useEffect(() => {
    if (controlled) {
      const curr = (((props as ControlledProps).value) || []).filter((p) => p && typeof p.attr === 'string');
      const nextSelected: SelectedPkg[] = curr.map((p) => ({ attr: p.attr, pname: p.pname }));
      setSelected((prev) => {
        const prevKey = JSON.stringify(prev);
        const nextKey = JSON.stringify(nextSelected);
        return prevKey === nextKey ? prev : nextSelected;
      });
      setChannelsByAttr((prev) => {
        const next: Record<string, NixChannel | ''> = { ...prev };
        for (const p of curr) {
          if (p.channel) next[p.attr] = p.channel;
        }
        return next;
      });
    } else {
      const conf = (props as UncontrolledProps).config as ConfigWithNix;
      const rawPkgs = conf.nix?.packages ?? [];
      const curr = (rawPkgs as NixPackageSelection[]).filter((p) => p && typeof p.attr === 'string');
      const nextSelected: SelectedPkg[] = curr.map((p) => ({ attr: p.attr, pname: p.pname }));
      setSelected((prev) => {
        const prevKey = JSON.stringify(prev);
        const nextKey = JSON.stringify(nextSelected);
        return prevKey === nextKey ? prev : nextSelected;
      });
      setChannelsByAttr((prev) => {
        const next: Record<string, NixChannel | ''> = { ...prev };
        for (const p of curr) {
          if (p.channel) next[p.attr] = p.channel;
        }
        return next;
      });
    }
  }, [controlled, controlledValueKey, uncontrolledPkgsKey]);

  // Push updates into node config when selections/channels change
  useEffect(() => {
    // Build packages array only for items with a chosen channel
    const packages = selected
      .map((p) => {
        const ch = channelsByAttr[p.attr] || '';
        if (!ch) return null;
        return { attr: p.attr, pname: p.pname, channel: ch } as { attr: string; pname?: string; channel: NixChannel };
      })
      .filter(Boolean) as Array<{ attr: string; pname?: string; channel: NixChannel }>;

    if (controlled) {
      const next: NixPackageSelection[] = packages.map((p) => ({ attr: p.attr, pname: p.pname, channel: p.channel }));
      // Avoid reentrancy loops; compare shallow JSON
      const json = JSON.stringify(next);
      if (json !== lastPushedJson.current) {
        lastPushedJson.current = json;
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
        (props as UncontrolledProps).onUpdateConfig(next);
      }
    }
  }, [selected, channelsByAttr, controlled, controlledValueKey, uncontrolledPkgsKey]);
  const listboxRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const debouncedQuery = useDebounced(query, 300);

  const qUnstable = useQuery({
    queryKey: ['nix', 'search', 'nixpkgs-unstable', debouncedQuery],
    queryFn: ({ signal }) => searchPackages(debouncedQuery, 'nixpkgs-unstable', signal),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 60_000,
  });
  const qStable = useQuery({
    queryKey: ['nix', 'search', 'nixos-24.11', debouncedQuery],
    queryFn: ({ signal }) => searchPackages(debouncedQuery, 'nixos-24.11', signal),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 60_000,
  });

  const suggestions: NixSearchItem[] = useMemo(() => {
    if (!debouncedQuery || debouncedQuery.trim().length < 2) return [];
    const a = qUnstable.data ?? [];
    const b = qStable.data ?? [];
    const merged = mergeChannelSearchResults(a, b);
    const filtered = merged.filter((m) => !selected.some((s) => s.attr === m.attr));
    return filtered.slice(0, 20);
  }, [qUnstable.data, qStable.data, debouncedQuery, selected]);

  const isSearching = debouncedQuery.trim().length >= 2 && (qUnstable.isFetching || qStable.isFetching);

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

  const addSelected = (item: NixSearchItem) => {
    setSelected((prev) => {
      if (prev.find((p) => p.attr === item.attr)) return prev;
      return [...prev, { attr: item.attr, pname: item.pname }];
    });
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeSelected = (attr: string) => {
    setSelected((prev) => prev.filter((p) => p.attr !== attr));
    setChannelsByAttr((prev) => {
      const { [attr]: _omit, ...rest } = prev;
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
            aria-busy={(qUnstable.isFetching || qStable.isFetching) ? 'true' : 'false'}
          >
            {(qUnstable.isFetching || qStable.isFetching) && suggestions.length === 0 ? (
              <li className="px-2 py-1 text-muted-foreground" aria-disabled="true">Searching…</li>
            ) : suggestions.length === 0 ? (
              <li className="px-2 py-1 text-muted-foreground" aria-disabled="true">No results</li>
            ) : (
              suggestions.map((s, idx) => {
                const label = s.pname ? `${s.pname} (${s.attr})` : s.attr;
                const active = idx === activeIndex;
                return (
                  <li
                    key={s.attr}
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
        const errA = qUnstable.error as unknown;
        const errB = qStable.error as unknown;
        const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';
        const showError = (!!errA && !isAbort(errA)) || (!!errB && !isAbort(errB));
        return showError ? (
        <div className="text-xs text-destructive" aria-live="polite">
          Error searching Nix packages. This may be due to CORS/network. Please retry.
        </div>
        ) : null;
      })()}

      {selected.length > 0 && (
        <ul className="space-y-2" aria-label="Selected Nix packages">
          {selected.map((p) => (
            <SelectedPackageItem
              key={p.attr}
              pkg={p}
              chosen={channelsByAttr[p.attr] || ''}
              onChoose={(ch) => setChannelsByAttr((prev) => ({ ...prev, [p.attr]: ch }))}
              onRemove={() => removeSelected(p.attr)}
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

function SelectedPackageItem({ pkg, chosen, onChoose, onRemove }: { pkg: { attr: string; pname?: string }; chosen: NixChannel | ''; onChoose: (ch: NixChannel | '') => void; onRemove: () => void }) {
  const qUnstable = useQuery({
    queryKey: ['nix', 'version', pkg.attr, 'nixpkgs-unstable'],
    queryFn: ({ signal }) => fetchPackageVersion({ attr: pkg.attr }, 'nixpkgs-unstable', signal),
    staleTime: 5 * 60_000,
  });
  const qStable = useQuery({
    queryKey: ['nix', 'version', pkg.attr, 'nixos-24.11'],
    queryFn: ({ signal }) => fetchPackageVersion({ attr: pkg.attr }, 'nixos-24.11', signal),
    staleTime: 5 * 60_000,
  });
  const options = useMemo(() => {
    return CHANNELS.map((ch) => ({
      ch,
      version: ch === 'nixpkgs-unstable' ? qUnstable.data : qStable.data,
      isLoading: ch === 'nixpkgs-unstable' ? qUnstable.isLoading : qStable.isLoading,
      isError: ch === 'nixpkgs-unstable' ? !!qUnstable.error : !!qStable.error,
    }));
  }, [qUnstable.data, qStable.data, qUnstable.isLoading, qStable.isLoading, qUnstable.error, qStable.error]);

  const label = pkg.pname ? `${pkg.pname} (${pkg.attr})` : pkg.attr;

  return (
    <li className="flex items-center gap-2">
      <span className="flex-1 text-sm">{label}</span>
      <select
        aria-label={`Select version for ${label}`}
        className="rounded border border-input bg-background px-2 py-1 text-sm"
        value={chosen}
        onChange={(e) => {
          const v = e.target.value;
          const isChannel = (x: string): x is NixChannel => (CHANNELS as readonly string[]).includes(x);
          onChoose(v === '' ? '' : isChannel(v) ? v : '');
        }}
      >
        <option value="">Select version…</option>
        {options.map(({ ch, version, isLoading, isError }) => (
          <option key={ch} value={ch} disabled={isLoading || isError || !version} title={isError ? 'Error fetching version' : undefined}>
            {ch}: {isLoading ? 'loading…' : isError ? 'error' : version ?? 'n/a'}
          </option>
        ))}
      </select>
      <Button type="button" size="sm" variant="outline" className="text-destructive" aria-label={`Remove ${label}`} onClick={onRemove}>
        ×
      </Button>
    </li>
  );
}

// End of component file
