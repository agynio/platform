import { useEffect, useMemo, useState } from 'react';
import type { StaticConfigViewProps } from './types';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';

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
  const [restrictOutput, setRestrictOutput] = useState<boolean>(!!init.restrictOutput);
  const [restrictionMaxInjections, setRestrictionMaxInjections] = useState<number>(
    typeof init.restrictionMaxInjections === 'number' ? (init.restrictionMaxInjections as number) : 0,
  );

  useEffect(() => {
    const errors: string[] = [];
    if (!model) errors.push('Model is required');
    if (restrictionMaxInjections < 0) errors.push('restrictionMaxInjections must be >= 0');
    onValidate?.(errors);
  }, [model, restrictionMaxInjections, onValidate]);

  useEffect(() => {
    onChange({
      ...value,
      model,
      systemPrompt,
      restrictOutput,
      restrictionMaxInjections,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, systemPrompt, restrictOutput, restrictionMaxInjections]);

  const isDisabled = !!readOnly || !!disabled;

  return (
    <div className="space-y-2 text-sm">
      <div>
        <Label>Model</Label>
        <Select
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
        </Select>
      </div>

      <div>
        <Label>System prompt</Label>
        <Textarea
          className="w-full border rounded px-2 py-1 bg-background"
          rows={5}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          readOnly={isDisabled}
          data-testid="simple-agent-system"
        />
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

