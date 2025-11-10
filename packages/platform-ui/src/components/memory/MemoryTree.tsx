import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import { memoryApi, type ListEntry } from '@/api/modules/memory';
import { joinMemoryPath, memoryPathSegments, normalizeMemoryPath } from './path';

type MemoryTreeProps = {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  selectedPath: string;
  onSelectPath: (path: string) => void;
  className?: string;
};

type DirectoryNodeProps = {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  path: string;
  name: string;
  level: number;
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  selectedPath: string;
  onSelectPath: (path: string) => void;
};

export function MemoryTree({ nodeId, scope, threadId, selectedPath, onSelectPath, className }: MemoryTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(['/']));
  const normalizedSelected = normalizeMemoryPath(selectedPath);

  useEffect(() => {
    setExpandedPaths(new Set(['/']));
  }, [nodeId, scope, threadId]);

  useEffect(() => {
    setExpandedPaths((prev) => {
      const segments = memoryPathSegments(normalizedSelected);
      let changed = false;
      const next = new Set(prev);
      for (const seg of segments) {
        if (!next.has(seg)) {
          next.add(seg);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [normalizedSelected]);

  return (
    <div className={`h-full overflow-y-auto text-sm ${className ?? ''}`}>
      <DirectoryNode
        nodeId={nodeId}
        scope={scope}
        threadId={threadId}
        path="/"
        name="/"
        level={0}
        expandedPaths={expandedPaths}
        togglePath={(path) =>
          setExpandedPaths((prev) => {
            const next = new Set(prev);
            if (path === '/') {
              next.add('/');
            } else if (next.has(path)) {
              next.delete(path);
            } else {
              next.add(path);
            }
            next.add('/');
            return next;
          })
        }
        selectedPath={normalizedSelected}
        onSelectPath={(path) => onSelectPath(normalizeMemoryPath(path))}
      />
    </div>
  );
}

function DirectoryNode({
  nodeId,
  scope,
  threadId,
  path,
  name,
  level,
  expandedPaths,
  togglePath,
  selectedPath,
  onSelectPath,
}: DirectoryNodeProps) {
  const normalizedPath = normalizeMemoryPath(path);
  const isExpanded = expandedPaths.has(normalizedPath);
  const listQuery = useQuery({
    queryKey: ['memory/list', nodeId, scope, threadId, normalizedPath],
    queryFn: () => memoryApi.list(nodeId, scope, threadId, normalizedPath),
    enabled: isExpanded,
    staleTime: 15_000,
  });

  const entries = useMemo(() => {
    if (!listQuery.data?.items) return [] as ListEntry[];
    const items = [...listQuery.data.items];
    items.sort((a, b) => {
      if (a.kind === b.kind) return a.name.localeCompare(b.name);
      return a.kind === 'dir' ? -1 : 1;
    });
    return items;
  }, [listQuery.data]);

  const isSelected = selectedPath === normalizedPath;

  const paddingLeft = Math.max(0, level * 16);

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 ${
          isSelected ? 'rounded bg-muted font-medium' : 'rounded hover:bg-muted'
        }`}
        style={{ paddingLeft }}
      >
        <button
          type="button"
          onClick={() => togglePath(normalizedPath)}
          className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={isExpanded ? 'Collapse directory' : 'Expand directory'}
        >
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          onClick={() => onSelectPath(normalizedPath)}
        >
          <Folder className="size-4 text-muted-foreground" />
          <span className="truncate">{name}</span>
        </button>
      </div>
      {isExpanded ? (
        <div className="pl-4">
          {listQuery.isLoading ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">Loading…</div>
          ) : listQuery.error ? (
            <div className="px-2 py-1 text-xs text-red-600" role="alert">
              {(listQuery.error as Error).message || 'Failed to load entries'}
              <button
                type="button"
                className="ml-2 text-xs text-primary underline"
                onClick={() => listQuery.refetch()}
              >
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="px-2 py-1 text-xs text-muted-foreground">No entries</div>
          ) : (
            entries.map((entry) => {
              const childPath = joinMemoryPath(normalizedPath, entry.name);
              if (entry.kind === 'dir') {
                return (
                  <DirectoryNode
                    key={childPath}
                    nodeId={nodeId}
                    scope={scope}
                    threadId={threadId}
                    path={childPath}
                    name={entry.name}
                    level={level + 1}
                    expandedPaths={expandedPaths}
                    togglePath={togglePath}
                    selectedPath={selectedPath}
                    onSelectPath={onSelectPath}
                  />
                );
              }
              return (
                <FileRow
                  key={childPath}
                  path={childPath}
                  name={entry.name}
                  level={level + 1}
                  selectedPath={selectedPath}
                  onSelectPath={onSelectPath}
                />
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function FileRow({
  path,
  name,
  level,
  selectedPath,
  onSelectPath,
}: {
  path: string;
  name: string;
  level: number;
  selectedPath: string;
  onSelectPath: (path: string) => void;
}) {
  const normalized = normalizeMemoryPath(path);
  const isSelected = selectedPath === normalized;
  const paddingLeft = Math.max(0, level * 16 + 16);

  return (
    <button
      type="button"
      onClick={() => onSelectPath(normalized)}
      className={`flex w-full items-center gap-2 px-2 py-1 text-left ${
        isSelected ? 'rounded bg-muted font-medium' : 'rounded hover:bg-muted'
      }`}
      style={{ paddingLeft }}
    >
      <FileText className="size-4 text-muted-foreground" />
      <span className="truncate">{name}</span>
    </button>
  );
}
