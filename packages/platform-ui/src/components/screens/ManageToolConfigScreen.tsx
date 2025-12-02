import { useEffect, useMemo, useState } from 'react';
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@agyn/ui';
import { Switch } from '@/components/ui/switch';
import type { StaticConfigViewProps } from '../configViews/types';

type ManageToolConfigScreenProps = Pick<StaticConfigViewProps, 'value' | 'onChange' | 'readOnly' | 'disabled' | 'onValidate'>;

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_MESSAGES = 1;
const DEFAULT_PREFIX = 'From {{agentTitle}}: ';

function coerceInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export default function ManageToolConfigScreen({ value, onChange, readOnly, disabled, onValidate }: ManageToolConfigScreenProps) {
  const init = useMemo<Record<string, unknown>>(() => ({ ...(value || {}) }), [value]);
  const [mode, setMode] = useState<'sync' | 'async'>(init.mode === 'async' ? 'async' : 'sync');
  const [syncTimeoutMs, setSyncTimeoutMs] = useState<number>(coerceInt(init.syncTimeoutMs, DEFAULT_TIMEOUT_MS));
  const [syncMaxMessages, setSyncMaxMessages] = useState<number>(coerceInt(init.syncMaxMessages, DEFAULT_MAX_MESSAGES));
  const [asyncPrefix, setAsyncPrefix] = useState<string>(
    typeof init.asyncPrefix === 'string' && init.asyncPrefix.length > 0 ? (init.asyncPrefix as string) : DEFAULT_PREFIX,
  );
  const [showCorrelation, setShowCorrelation] = useState<boolean>(init.showCorrelationInOutput === true);

  const isDisabled = !!readOnly || !!disabled;

  useEffect(() => {
    setMode(init.mode === 'async' ? 'async' : 'sync');
    setSyncTimeoutMs(coerceInt(init.syncTimeoutMs, DEFAULT_TIMEOUT_MS));
    setSyncMaxMessages(coerceInt(init.syncMaxMessages, DEFAULT_MAX_MESSAGES));
    setAsyncPrefix(
      typeof init.asyncPrefix === 'string' && init.asyncPrefix.length > 0 ? (init.asyncPrefix as string) : DEFAULT_PREFIX,
    );
    setShowCorrelation(init.showCorrelationInOutput === true);
  }, [init]);

  useEffect(() => {
    const errors: string[] = [];
    const timeoutValid = Number.isInteger(syncTimeoutMs) && syncTimeoutMs >= 1000 && syncTimeoutMs <= 300000;
    const maxMsgValid = Number.isInteger(syncMaxMessages) && syncMaxMessages >= 1 && syncMaxMessages <= 10;
    if (mode === 'sync') {
      if (!timeoutValid) errors.push('syncTimeoutMs must be between 1000 and 300000');
      if (!maxMsgValid) errors.push('syncMaxMessages must be between 1 and 10');
    }
    if (asyncPrefix.length > 256) errors.push('asyncPrefix must be 256 characters or fewer');
    onValidate?.(errors);
  }, [mode, syncTimeoutMs, syncMaxMessages, asyncPrefix, onValidate]);

  useEffect(() => {
    const next = {
      ...value,
      mode,
      syncTimeoutMs,
      syncMaxMessages,
      asyncPrefix,
      showCorrelationInOutput: showCorrelation,
    };
    if (JSON.stringify(value || {}) !== JSON.stringify(next)) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, syncTimeoutMs, syncMaxMessages, asyncPrefix, showCorrelation]);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <Label htmlFor="manage-mode" className="block text-xs mb-1">Forwarding mode</Label>
        <Select value={mode} onValueChange={(val) => setMode(val === 'async' ? 'async' : 'sync')} disabled={isDisabled}>
          <SelectTrigger id="manage-mode" className="w-full">
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sync">Sync (wait for first response)</SelectItem>
            <SelectItem value="async">Async (forward to parent agent)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === 'sync' && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="manage-sync-timeout" className="block text-xs mb-1">Sync timeout (ms)</Label>
            <Input
              id="manage-sync-timeout"
              type="number"
              min={1000}
              max={300000}
              step={500}
              value={syncTimeoutMs}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                setSyncTimeoutMs(Number.isFinite(parsed) ? parsed : DEFAULT_TIMEOUT_MS);
              }}
              disabled={isDisabled}
            />
            <div className="text-[10px] text-muted-foreground mt-1">Maximum wait before failing when no worker response arrives.</div>
          </div>
          <div>
            <Label htmlFor="manage-sync-max" className="block text-xs mb-1">Max messages to collect</Label>
            <Input
              id="manage-sync-max"
              type="number"
              min={1}
              max={10}
              value={syncMaxMessages}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                setSyncMaxMessages(Number.isFinite(parsed) ? parsed : DEFAULT_MAX_MESSAGES);
              }}
              disabled={isDisabled}
            />
            <div className="text-[10px] text-muted-foreground mt-1">Collect this many assistant messages before returning.</div>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="manage-async-prefix" className="block text-xs mb-1">Async prefix</Label>
        <Input
          id="manage-async-prefix"
          value={asyncPrefix}
          onChange={(e) => setAsyncPrefix(e.target.value)}
          disabled={isDisabled}
          placeholder="From {{agentTitle}}: "
        />
        <div className="text-[10px] text-muted-foreground mt-1">
          Applied before forwarded text. Use <code className="font-mono">{'{{agentTitle}}'}</code> to insert the worker title.
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div>
          <div className="text-xs font-medium">Show correlation in output</div>
          <div className="text-[10px] text-muted-foreground">Include worker alias and thread id in forwarded responses.</div>
        </div>
        <Switch checked={showCorrelation} onCheckedChange={(next) => setShowCorrelation(next)} disabled={isDisabled} />
      </div>
    </div>
  );
}
