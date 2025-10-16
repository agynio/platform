import React, { useEffect, useMemo, useState } from 'react';
import type { StaticConfigViewProps } from './types';

function isGithubUrl(u: string) {
  return /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?$/.test(u);
}

export default function GithubCloneRepoToolConfigView({ value, onChange, readOnly, disabled, onValidate }: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [repoUrl, setRepoUrl] = useState<string>((init.repoUrl as string) || '');
  const [destPath, setDestPath] = useState<string>((init.destPath as string) || '/workspace');
  const [authToken, setAuthToken] = useState<string>((init.authToken as string) || '');

  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    const errors: string[] = [];
    if (!repoUrl) errors.push('repoUrl is required');
    else if (!isGithubUrl(repoUrl)) errors.push('repoUrl must be a valid GitHub URL');
    if (!destPath) errors.push('destPath is required');
    onValidate?.(errors);
  }, [repoUrl, destPath, onValidate]);

  useEffect(() => {
    onChange({ ...value, repoUrl, destPath, authToken });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoUrl, destPath, authToken]);

  return (
    <div className="space-y-3 text-sm">
      <div>
        <label className="block text-xs mb-1">Repository URL</label>
        <input className="w-full border rounded px-2 py-1" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} disabled={isDisabled} placeholder="https://github.com/org/repo" />
      </div>
      <div>
        <label className="block text-xs mb-1">Destination path</label>
        <input className="w-full border rounded px-2 py-1" value={destPath} onChange={(e) => setDestPath(e.target.value)} disabled={isDisabled} />
      </div>
      <div>
        <label className="block text-xs mb-1">Auth token (optional)</label>
        <input className="w-full border rounded px-2 py-1" value={authToken} onChange={(e) => setAuthToken(e.target.value)} disabled={isDisabled} placeholder="vault ref or token" />
        <div className="text-[10px] text-muted-foreground mt-1">Use a vault ref in production; raw token only for testing.</div>
      </div>
    </div>
  );
}

