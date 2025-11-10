import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { Button, Input, Label, Textarea } from '@agyn/ui';
import { memoryApi } from '@/api/modules/memory';
import { notifyError, notifySuccess } from '@/lib/notify';
import { joinMemoryPath, memoryPathParent, normalizeMemoryPath } from './path';

type MemoryEditorProps = {
  nodeId: string;
  scope: 'global' | 'perThread';
  threadId?: string;
  path: string;
  onPathChange?: (next: string) => void;
};

export function MemoryEditor({ nodeId, scope, threadId, path, onPathChange }: MemoryEditorProps) {
  const qc = useQueryClient();
  const normalizedPath = normalizeMemoryPath(path);

  const [appendText, setAppendText] = useState('');
  const [replaceOld, setReplaceOld] = useState('');
  const [replaceNew, setReplaceNew] = useState('');
  const [newDirName, setNewDirName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');

  useEffect(() => {
    setAppendText('');
    setReplaceOld('');
    setReplaceNew('');
    setNewDirName('');
    setNewFileName('');
    setNewFileContent('');
  }, [normalizedPath, nodeId, scope, threadId]);

  const statQuery = useQuery({
    queryKey: ['memory/stat', nodeId, scope, threadId, normalizedPath],
    queryFn: () => memoryApi.stat(nodeId, scope, threadId, normalizedPath),
    staleTime: 10_000,
  });

  const isFile = statQuery.data?.kind === 'file';

  const readQuery = useQuery({
    queryKey: ['memory/read', nodeId, scope, threadId, normalizedPath],
    queryFn: () => memoryApi.read(nodeId, scope, threadId, normalizedPath),
    enabled: isFile,
  });

  const invalidateLists = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['memory/list', nodeId, scope, threadId] });
  }, [qc, nodeId, scope, threadId]);

  const invalidatePath = useCallback(
    (targetPath: string) => {
      const normalized = normalizeMemoryPath(targetPath);
      qc.invalidateQueries({ queryKey: ['memory/stat', nodeId, scope, threadId, normalized] });
      qc.invalidateQueries({ queryKey: ['memory/read', nodeId, scope, threadId, normalized] });
    },
    [qc, nodeId, scope, threadId],
  );

  const appendMutation = useMutation({
    mutationFn: async (nextPath: string) => memoryApi.append(nodeId, scope, threadId, nextPath, appendText),
    onSuccess: (_data, nextPath) => {
      notifySuccess('Content appended to file');
      invalidateLists();
      invalidatePath(nextPath);
      setAppendText('');
    },
    onError: (err: unknown) => notifyError((err as Error)?.message || 'Failed to append'),
  });

  const updateMutation = useMutation({
    mutationFn: async () => memoryApi.update(nodeId, scope, threadId, normalizedPath, replaceOld, replaceNew),
    onSuccess: () => {
      notifySuccess('File updated');
      invalidatePath(normalizedPath);
      setReplaceOld('');
      setReplaceNew('');
    },
    onError: (err: unknown) => notifyError((err as Error)?.message || 'Failed to update file'),
  });

  const ensureDirMutation = useMutation({
    mutationFn: async (target: string) => memoryApi.ensureDir(nodeId, scope, threadId, target),
    onSuccess: (_data, target) => {
      notifySuccess('Directory ensured');
      invalidateLists();
      invalidatePath(target);
      setNewDirName('');
      if (onPathChange) {
        onPathChange(target);
      }
    },
    onError: (err: unknown) => notifyError((err as Error)?.message || 'Failed to ensure directory'),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => memoryApi.delete(nodeId, scope, threadId, normalizedPath),
    onSuccess: () => {
      notifySuccess('Deleted successfully');
      invalidateLists();
      invalidatePath(normalizedPath);
      const parent = memoryPathParent(normalizedPath);
      if (onPathChange) {
        onPathChange(parent);
      }
    },
    onError: (err: unknown) => notifyError((err as Error)?.message || 'Failed to delete'),
  });

  const createFileMutation = useMutation({
    mutationFn: async (target: { path: string; content: string }) =>
      memoryApi.append(nodeId, scope, threadId, target.path, target.content),
    onSuccess: (_data, target) => {
      notifySuccess('File created');
      invalidateLists();
      invalidatePath(target.path);
      setNewFileName('');
      setNewFileContent('');
      onPathChange?.(target.path);
    },
    onError: (err: unknown) => notifyError((err as Error)?.message || 'Failed to create file'),
  });

  const derivedInfo = useMemo(() => {
    if (statQuery.isLoading) return 'Loading…';
    if (statQuery.error) return 'Error';
    if (statQuery.data?.kind === 'file') return 'File';
    if (statQuery.data?.kind === 'dir') return 'Directory';
    return 'Missing';
  }, [statQuery.data, statQuery.error, statQuery.isLoading]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-lg font-semibold">Memory editor</h2>
        <div className="mt-1 text-xs text-muted-foreground break-all">{normalizedPath}</div>
        <div className="mt-1 text-xs uppercase text-muted-foreground">{derivedInfo}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {statQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading path…</div>
        ) : statQuery.error ? (
          <div className="space-y-2">
            <div className="text-sm text-red-600" role="alert">
              {(statQuery.error as Error).message || 'Failed to load path'}
            </div>
            <Button size="sm" onClick={() => statQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : statQuery.data?.kind === 'file' ? (
          <FileEditor
            readState={readQuery}
            appendText={appendText}
            setAppendText={setAppendText}
            onAppend={() => appendMutation.mutate(normalizedPath)}
            appendDisabled={appendMutation.isPending || !appendText.trim()}
            replaceOld={replaceOld}
            setReplaceOld={setReplaceOld}
            replaceNew={replaceNew}
            setReplaceNew={setReplaceNew}
            onReplace={() => updateMutation.mutate()}
            replaceDisabled={updateMutation.isPending || !replaceOld}
            onDelete={() => deleteMutation.mutate()}
            deleteDisabled={deleteMutation.isPending || normalizedPath === '/'}
          />
        ) : statQuery.data?.kind === 'dir' ? (
          <DirectoryEditor
            path={normalizedPath}
            ensureDirMutation={ensureDirMutation}
            deleteMutation={deleteMutation}
            canDelete={normalizedPath !== '/'}
            newDirName={newDirName}
            setNewDirName={setNewDirName}
            onCreateDir={() => {
              const name = newDirName.trim();
              if (!name) return;
              const target = joinMemoryPath(normalizedPath, name);
              ensureDirMutation.mutate(target);
            }}
            canCreateDir={Boolean(newDirName.trim())}
            newFileName={newFileName}
            setNewFileName={setNewFileName}
            newFileContent={newFileContent}
            setNewFileContent={setNewFileContent}
            onCreateFile={() =>
              createFileMutation.mutate({
                path: joinMemoryPath(normalizedPath, newFileName.trim()),
                content: newFileContent,
              })
            }
            createFileDisabled={
              createFileMutation.isPending || !newFileName.trim() || !newFileContent.trim()
            }
            ensureCurrent={() => ensureDirMutation.mutate(normalizedPath)}
          />
        ) : (
          <MissingPath
            path={normalizedPath}
            ensureDir={() => ensureDirMutation.mutate(normalizedPath)}
            createFile={() =>
              createFileMutation.mutate({ path: normalizedPath, content: newFileContent })
            }
            newFileContent={newFileContent}
            setNewFileContent={setNewFileContent}
            canCreateFile={Boolean(newFileContent.trim())}
            ensurePending={ensureDirMutation.isPending}
            createPending={createFileMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}

function FileEditor({
  readState,
  appendText,
  setAppendText,
  onAppend,
  appendDisabled,
  replaceOld,
  setReplaceOld,
  replaceNew,
  setReplaceNew,
  onReplace,
  replaceDisabled,
  onDelete,
  deleteDisabled,
}: {
  readState: UseQueryResult<{ content: string }>;
  appendText: string;
  setAppendText: (val: string) => void;
  onAppend: () => void;
  appendDisabled: boolean;
  replaceOld: string;
  setReplaceOld: (val: string) => void;
  replaceNew: string;
  setReplaceNew: (val: string) => void;
  onReplace: () => void;
  replaceDisabled: boolean;
  onDelete: () => void;
  deleteDisabled: boolean;
}) {
  return (
    <div className="space-y-4">
      {readState.isLoading ? (
        <div className="text-sm text-muted-foreground">Reading file…</div>
      ) : readState.error ? (
        <div className="text-sm text-red-600" role="alert">
          {(readState.error as Error).message || 'Failed to read file'}
        </div>
      ) : (
        <Textarea value={readState.data?.content ?? ''} readOnly className="h-48" />
      )}

      <div className="space-y-2">
        <Label htmlFor="memory-append">Append</Label>
        <Textarea
          id="memory-append"
          value={appendText}
          onChange={(e) => setAppendText(e.target.value)}
          placeholder="New content to append"
        />
        <Button onClick={onAppend} disabled={appendDisabled}>
          Append content
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Replace</Label>
        <Input
          value={replaceOld}
          onChange={(e) => setReplaceOld(e.target.value)}
          placeholder="Old text"
        />
        <Input
          value={replaceNew}
          onChange={(e) => setReplaceNew(e.target.value)}
          placeholder="New text"
        />
        <Button onClick={onReplace} disabled={replaceDisabled}>
          Replace in file
        </Button>
      </div>

      <Button variant="destructive" onClick={onDelete} disabled={deleteDisabled}>
        Delete file
      </Button>
    </div>
  );
}

type DirEditorProps = {
  path: string;
  ensureDirMutation: UseMutationResult<void, unknown, string>;
  deleteMutation: UseMutationResult<{ files: number; dirs: number }, unknown, void>;
  canDelete: boolean;
  newDirName: string;
  setNewDirName: (val: string) => void;
  onCreateDir: () => void;
  canCreateDir: boolean;
  newFileName: string;
  setNewFileName: (val: string) => void;
  newFileContent: string;
  setNewFileContent: (val: string) => void;
  onCreateFile: () => void;
  createFileDisabled: boolean;
  ensureCurrent: () => void;
};

function DirectoryEditor({
  path,
  ensureDirMutation,
  deleteMutation,
  canDelete,
  newDirName,
  setNewDirName,
  onCreateDir,
  canCreateDir,
  newFileName,
  setNewFileName,
  newFileContent,
  setNewFileContent,
  onCreateFile,
  createFileDisabled,
  ensureCurrent,
}: DirEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Directory actions for {path}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={ensureCurrent} disabled={ensureDirMutation.isPending}>
            Ensure directory exists
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending || !canDelete}
          >
            Delete directory
          </Button>
        </div>
        {!canDelete && (
          <div className="text-xs text-muted-foreground">Root directory cannot be deleted.</div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="memory-new-dir">Create subdirectory</Label>
        <Input
          id="memory-new-dir"
          value={newDirName}
          onChange={(e) => setNewDirName(e.target.value)}
          placeholder="Directory name"
        />
        <Button onClick={onCreateDir} disabled={!canCreateDir || ensureDirMutation.isPending}>
          Create directory
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="memory-new-file">Create file</Label>
        <Input
          id="memory-new-file"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          placeholder="File name"
        />
        <Textarea
          value={newFileContent}
          onChange={(e) => setNewFileContent(e.target.value)}
          placeholder="Initial content"
        />
        <Button onClick={onCreateFile} disabled={createFileDisabled}>
          Create file
        </Button>
      </div>
    </div>
  );
}

function MissingPath({
  path,
  ensureDir,
  createFile,
  newFileContent,
  setNewFileContent,
  canCreateFile,
  ensurePending,
  createPending,
}: {
  path: string;
  ensureDir: () => void;
  createFile: () => void;
  newFileContent: string;
  setNewFileContent: (val: string) => void;
  canCreateFile: boolean;
  ensurePending: boolean;
  createPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground" role="alert">
        Path “{path}” not found. You can create it as a directory or file.
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={ensureDir} disabled={ensurePending}>
          Create directory
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="memory-missing-file">Create file with content</Label>
        <Textarea
          id="memory-missing-file"
          value={newFileContent}
          onChange={(e) => setNewFileContent(e.target.value)}
          placeholder="File content"
        />
        <Button onClick={createFile} disabled={!canCreateFile || createPending}>
          Create file
        </Button>
      </div>
    </div>
  );
}
