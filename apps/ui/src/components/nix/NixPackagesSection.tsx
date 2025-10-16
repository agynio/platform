import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NixChannel, NixSearchItem } from '@/services/nix';
import { fetchPackageVersion, mergeChannelSearchResults, searchPackages } from '@/services/nix';

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

const CHANNELS: NixChannel[] = ['nixpkgs-unstable', 'nixos-24.11'];

export function NixPackagesSection() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<SelectedPkg[]>([]);
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
    return mergeChannelSearchResults(a, b).slice(0, 20);
  }, [qUnstable.data, qStable.data, debouncedQuery]);

  useEffect(() => {
    setIsOpen(suggestions.length > 0 && document.activeElement === inputRef.current);
    setActiveIndex(0);
  }, [suggestions.length]);

  const addSelected = (item: NixSearchItem) => {
    setSelected((prev) => {
      if (prev.find((p) => p.attr === item.attr)) return prev;
      return [...prev, { attr: item.attr, pname: item.pname }];
    });
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeSelected = (attr: string) => setSelected((prev) => prev.filter((p) => p.attr !== attr));

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
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase text-muted-foreground">Nix Packages (beta)</div>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(suggestions.length > 0)}
          onKeyDown={onKeyDown}
          placeholder="Search Nix packages..."
          className="w-full rounded border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="nix-search-listbox"
          aria-autocomplete="list"
        />
        {isOpen && suggestions.length > 0 && (
          <ul
            id="nix-search-listbox"
            role="listbox"
            ref={listboxRef}
            className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-input bg-popover text-sm shadow"
          >
            {suggestions.map((s, idx) => {
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
            })}
          </ul>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="space-y-2" aria-label="Selected Nix packages">
          {selected.map((p) => (
            <SelectedPackageItem key={p.attr} pkg={p} onRemove={() => removeSelected(p.attr)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectedPackageItem({ pkg, onRemove }: { pkg: { attr: string; pname?: string }; onRemove: () => void }) {
  const [chosen, setChosen] = useState<NixChannel | ''>('');
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
    return ['nixpkgs-unstable', 'nixos-24.11'].map((ch) => ({
      ch: ch as NixChannel,
      version: ch === 'nixpkgs-unstable' ? qUnstable.data : qStable.data,
      isLoading: ch === 'nixpkgs-unstable' ? qUnstable.isLoading : qStable.isLoading,
    }));
  }, [qUnstable.data, qStable.data, qUnstable.isLoading, qStable.isLoading]);

  const label = pkg.pname ? `${pkg.pname} (${pkg.attr})` : pkg.attr;

  return (
    <li className="flex items-center gap-2">
      <span className="flex-1 text-sm">{label}</span>
      <select
        aria-label={`Select version for ${label}`}
        className="rounded border border-input bg-background px-2 py-1 text-sm"
        value={chosen}
        onChange={(e) => setChosen(e.target.value as NixChannel | '')}
      >
        <option value="">Select version…</option>
        {options.map(({ ch, version, isLoading }) => (
          <option key={ch} value={ch} disabled={isLoading || !version}>
            {ch}: {isLoading ? 'loading…' : version ?? 'n/a'}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}

export default NixPackagesSection;

