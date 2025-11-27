import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Input } from '../Input';
import { ReferenceInput } from '../ReferenceInput';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

import { FieldLabel } from './FieldLabel';
import type { EnvVar } from './types';
import { toReferenceSourceType } from './utils';

export interface EnvEditorProps {
  title: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  envVars: EnvVar[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onNameChange: (index: number, value: string) => void;
  onValueChange: (index: number, value: string) => void;
  onValueFocus?: (index: number) => void;
  onSourceTypeChange: (index: number, type: 'text' | 'secret' | 'variable') => void;
  secretSuggestions: string[];
  variableSuggestions: string[];
}

export function EnvEditor({
  title,
  isOpen,
  onOpenChange,
  envVars,
  onAdd,
  onRemove,
  onNameChange,
  onValueChange,
  onValueFocus,
  onSourceTypeChange,
  secretSuggestions,
  variableSuggestions,
}: EnvEditorProps) {
  return (
    <section>
      <Collapsible open={isOpen} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
            <h3 className="text-[var(--agyn-dark)] font-semibold">{title}</h3>
            {isOpen ? <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" /> : <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-3">
            {envVars.map((envVar, index) => (
              <div key={`${envVar.name}-${index}`} className="space-y-3">
                <div className="flex-1">
                  <FieldLabel label="Name" />
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="VARIABLE_NAME"
                      value={envVar.name}
                      onChange={(event) => onNameChange(index, event.target.value)}
                      size="sm"
                      className="flex-1"
                    />
                    <div className="w-[40px] flex items-center justify-center">
                      <IconButton
                        icon={<Trash2 className="w-4 h-4" />}
                        variant="ghost"
                        size="sm"
                        type="button"
                        aria-label="Remove variable"
                        title="Remove variable"
                        onClick={() => onRemove(index)}
                        className="hover:text-[var(--agyn-status-failed)]"
                      />
                    </div>
                  </div>
                </div>
                <div className="pr-[48px]">
                  <FieldLabel label="Value" />
                  <ReferenceInput
                    value={envVar.value}
                    onChange={(event) => onValueChange(index, event.target.value)}
                    onFocus={() => onValueFocus?.(index)}
                    sourceType={toReferenceSourceType(envVar.source)}
                    onSourceTypeChange={(type) => onSourceTypeChange(index, type)}
                    secretKeys={secretSuggestions}
                    variableKeys={variableSuggestions}
                    placeholder="Value or reference..."
                    size="sm"
                  />
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={onAdd}>
              Add Variable
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
