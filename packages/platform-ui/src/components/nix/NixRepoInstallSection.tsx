import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, Input } from '@agyn/ui';
import { AxiosError, isAxiosError } from 'axios';

import type { FlakeRepoSelection } from './types';
import { resolveRepo } from '@/api/modules/nix';

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

interface NixRepoInstallSectionProps {
  entries: FlakeRepoSelection[];
  onChange: (next: FlakeRepoSelection[]) => void;
}

export function NixRepoInstallSection({ entries, onChange }: NixRepoInstallSectionProps) {
  const [form, setForm] = useState<{ repository: string; ref: string; attr: string }>({
    repository: '',
    ref: '',
    attr: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [updatingIndex, setUpdatingIndex] = useState<number | null>(null);
  const resolveRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      resolveRef.current?.abort();
    };
  }, []);

  const updateField = useCallback((field: 'repository' | 'ref' | 'attr', value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
  }, [error]);

  const handleSubmit = useCallback(async (event?: FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
    if (submitting) return;
    const repository = form.repository.trim();
    const attr = form.attr.trim();
    const ref = form.ref.trim();
    if (!repository || !attr) {
      setError('Repository and attribute are required.');
      return;
    }
    resolveRef.current?.abort();
    const controller = new AbortController();
    resolveRef.current = controller;
    setSubmitting(true);
    setError(null);
    try {
      const result = await resolveRepo(repository, attr, ref || undefined, controller.signal);
      const nextEntry: FlakeRepoSelection = {
        kind: 'flakeRepo',
        repository: result.repository,
        commitHash: result.commitHash,
        attributePath: result.attributePath,
        ...(result.ref ? { ref: result.ref } : {}),
      };
      const existingIndex = entries.findIndex(
        (entry) => entry.repository === nextEntry.repository && entry.attributePath === nextEntry.attributePath,
      );
      if (existingIndex >= 0) {
        const next = entries.map((entry, index) => (index === existingIndex ? nextEntry : entry));
        onChange(next);
      } else {
        onChange([...entries, nextEntry]);
      }
      setForm({ repository: '', ref: '', attr: '' });
    } catch (err) {
      if (!isCancellationError(err)) {
        setError(describeRepoError(err));
      }
    } finally {
      setSubmitting(false);
      if (resolveRef.current === controller) {
        resolveRef.current = null;
      }
    }
  }, [entries, form.attr, form.repository, form.ref, onChange, submitting]);

  const handleRefresh = useCallback(async (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    if (updatingIndex !== null && updatingIndex !== index) return;
    resolveRef.current?.abort();
    const controller = new AbortController();
    resolveRef.current = controller;
    setUpdatingIndex(index);
    setError(null);
    try {
      const result = await resolveRepo(entry.repository, entry.attributePath, entry.ref, controller.signal);
      const nextEntry: FlakeRepoSelection = {
        kind: 'flakeRepo',
        repository: result.repository,
        commitHash: result.commitHash,
        attributePath: result.attributePath,
        ...(result.ref ? { ref: result.ref } : {}),
      };
      const next = entries.map((current, idx) => (idx === index ? nextEntry : current));
      onChange(next);
    } catch (err) {
      if (!isCancellationError(err)) {
        setError(describeRepoError(err));
      }
    } finally {
      if (resolveRef.current === controller) {
        resolveRef.current = null;
      }
      setUpdatingIndex((prev) => (prev === index ? null : prev));
    }
  }, [entries, onChange, updatingIndex]);

  const handleRemove = useCallback((index: number) => {
    if (updatingIndex === index) {
      resolveRef.current?.abort();
      setUpdatingIndex(null);
    }
    onChange(entries.filter((_, idx) => idx !== index));
  }, [entries, onChange, updatingIndex]);

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase text-muted-foreground">Install from Git repository (advanced)</div>
      <form className="flex flex-col gap-2 md:flex-row md:items-end" onSubmit={handleSubmit}>
        <div className="flex-1">
          <label htmlFor="nix-repo-repository" className="block text-xs mb-1">Repository</label>
          <Input
            id="nix-repo-repository"
            value={form.repository}
            onChange={(event) => updateField('repository', event.target.value)}
            placeholder="owner/repo or github:owner/repo"
            aria-label="GitHub repository"
            autoComplete="off"
          />
        </div>
        <div className="md:w-36">
          <label htmlFor="nix-repo-ref" className="block text-xs mb-1">Branch/Ref (optional)</label>
          <Input
            id="nix-repo-ref"
            value={form.ref}
            onChange={(event) => updateField('ref', event.target.value)}
            placeholder="main"
            aria-label="Git ref"
            autoComplete="off"
          />
        </div>
        <div className="md:w-64">
          <label htmlFor="nix-repo-attr" className="block text-xs mb-1">Package Attribute</label>
          <Input
            id="nix-repo-attr"
            value={form.attr}
            onChange={(event) => updateField('attr', event.target.value)}
            placeholder="packages.x86_64-linux.default"
            aria-label="Flake attribute"
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={submitting} className="md:w-28">
          {submitting ? 'Resolving…' : 'Install'}
        </Button>
      </form>
      {error && (
        <div className="text-xs text-destructive" aria-live="polite">
          {error}
        </div>
      )}
      {entries.length > 0 && (
        <ul className="space-y-2" aria-label="Custom flake repositories">
          {entries.map((entry, index) => {
            const isUpdating = updatingIndex === index;
            const disableUpdate = submitting || isUpdating;
            const disableRemove = submitting || isUpdating;
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
                      onClick={() => void handleRefresh(index)}
                    >
                      {isUpdating ? 'Updating…' : 'Refresh'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disableRemove}
                      onClick={() => handleRemove(index)}
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
  );
}

export type { NixRepoInstallSectionProps };
