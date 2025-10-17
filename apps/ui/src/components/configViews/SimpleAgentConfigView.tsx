import { useEffect, useMemo, useState } from 'react';
import type { StaticConfigViewProps } from './types';
// Use shared UI lib components; do not import from app alias paths.
import { Label } from '@hautech/ui';

const MODELS = ['gpt-5', 'gpt-4o-mini', 'o3-mini'];

export default function SimpleAgentConfigView({
  templateName: _tpl,
  value,
  onChange,
  readOnly,
  disabled,
  onValidate,
}: StaticConfigViewProps) {
  const init = useMemo(() => ({ ...(value || {}) }), [value]);
  const [model, setModel] = useState<string>((init.model as string) || MODELS[0]);
  const [systemPrompt, setSystemPrompt] = useState<string>((init.systemPrompt as string) || '');
  const [title, setTitle] = useState<string>((init.title as string) || '');
  const [debounceMs, setDebounceMs] = useState<number>(typeof init.debounceMs === 'number' ? (init.debounceMs as number) : 0);
  const [whenBusy, setWhenBusy] = useState<string>((init.whenBusy as string) || 'wait');
  const [processBuffer, setProcessBuffer] = useState<string>((init.processBuffer as string) || 'allTogether');
  const [summarizationKeepTokens, setSummarizationKeepTokens] = useState<number>(
    typeof init.summarizationKeepTokens === 'number' ? (init.summarizationKeepTokens as number) : 0,
  );
  const [summarizationMaxTokens, setSummarizationMaxTokens] = useState<number>(
    typeof init.summarizationMaxTokens === 'number' ? (init.summarizationMaxTokens as number) : 512,
  );
  const [restrictOutput, setRestrictOutput] = useState<boolean>(!!init.restrictOutput);
  const [restrictionMessage, setRestrictionMessage] = useState<string>((init.restrictionMessage as string) || '');
  const [restrictionMaxInjections, setRestrictionMaxInjections] = useState<number>(
    typeof init.restrictionMaxInjections === 'number' ? (init.restrictionMaxInjections as number) : 0,
  );

  useEffect(() => {
    const errors: string[] = [];
    if (!model) errors.push('Model is required');
    if (restrictionMaxInjections < 0) errors.push('restrictionMaxInjections must be >= 0');
    if (debounceMs < 0) errors.push('debounceMs must be >= 0');
    if (!['wait', 'injectAfterTools'].includes(whenBusy)) errors.push('whenBusy must be wait|injectAfterTools');
    if (!['allTogether', 'oneByOne'].includes(processBuffer)) errors.push('processBuffer must be allTogether|oneByOne');
    if (summarizationKeepTokens < 0) errors.push('summarizationKeepTokens must be >= 0');
    if (summarizationMaxTokens < 1) errors.push('summarizationMaxTokens must be >= 1');
    onValidate?.(errors);
  }, [model, debounceMs, whenBusy, processBuffer, summarizationKeepTokens, summarizationMaxTokens, restrictionMaxInjections, onValidate]);

  useEffect(() => {
    onChange({
      ...value,
      title: title || undefined,
      model,
      systemPrompt,
      debounceMs,
      whenBusy,
      processBuffer,
      summarizationKeepTokens,
      summarizationMaxTokens,
      restrictOutput,
      restrictionMessage: restrictionMessage || undefined,
      restrictionMaxInjections,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, model, systemPrompt, debounceMs, whenBusy, processBuffer, summarizationKeepTokens, summarizationMaxTokens, restrictOutput, restrictionMessage, restrictionMaxInjections]);

  const isDisabled = !!readOnly || !!disabled;

  return (
    <div className="space-y-2 text-sm">
      <div>
        <Label>Title (optional)</Label>
        <input
          className="w-full border rounded px-2 py-1 bg-background"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isDisabled}
        />
      </div>
      <div>
        <Label>Model</Label>
        <select
          className="w-full border rounded px-2 py-1 bg-background"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={isDisabled}
          data-testid="simple-agent-model"
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label>System prompt</Label>
        <textarea
          className="w-full border rounded px-2 py-1 bg-background"
          rows={5}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          readOnly={isDisabled}
          data-testid="simple-agent-system"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Debounce (ms)</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={debounceMs}
            min={0}
            onChange={(e) => setDebounceMs(parseInt(e.target.value || '0', 10))}
            disabled={isDisabled}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">When busy</label>
          <select className="w-full border rounded px-2 py-1 bg-background" value={whenBusy} onChange={(e) => setWhenBusy(e.target.value)} disabled={isDisabled}>
            <option value="wait">wait</option>
            <option value="injectAfterTools">injectAfterTools</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Process buffer</label>
          <select className="w-full border rounded px-2 py-1 bg-background" value={processBuffer} onChange={(e) => setProcessBuffer(e.target.value)} disabled={isDisabled}>
            <option value="allTogether">allTogether</option>
            <option value="oneByOne">oneByOne</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Summarization: keep tokens</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={summarizationKeepTokens}
            min={0}
            onChange={(e) => setSummarizationKeepTokens(parseInt(e.target.value || '0', 10))}
            disabled={isDisabled}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Summarization: max tokens</label>
          <input
            type="number"
            className="w-full border rounded px-2 py-1 bg-background"
            value={summarizationMaxTokens}
            min={1}
            onChange={(e) => setSummarizationMaxTokens(parseInt(e.target.value || '1', 10))}
            disabled={isDisabled}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="restrictOutput"
          type="checkbox"
          className="h-4 w-4"
          checked={restrictOutput}
          onChange={(e) => setRestrictOutput(e.target.checked)}
          disabled={isDisabled}
        />
        <label htmlFor="restrictOutput" className="text-xs">
          Require tool call before finish
        </label>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Restriction message</label>
        <textarea
          className="w-full border rounded px-2 py-1 bg-background"
          rows={3}
          value={restrictionMessage}
          onChange={(e) => setRestrictionMessage(e.target.value)}
          disabled={isDisabled}
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Max enforcement injections</label>
        <input
          type="number"
          className="w-full border rounded px-2 py-1 bg-background"
          value={restrictionMaxInjections}
          min={0}
          onChange={(e) => setRestrictionMaxInjections(parseInt(e.target.value || '0', 10))}
          disabled={isDisabled}
          data-testid="simple-agent-maxinj"
        />
      </div>
    </div>
  );
}
