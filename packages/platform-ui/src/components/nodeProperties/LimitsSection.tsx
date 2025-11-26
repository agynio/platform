import { ChevronDown, ChevronUp } from 'lucide-react';

import { Input } from '../Input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';

import { FieldLabel } from './FieldLabel';

export interface LimitField {
  key: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

interface LimitsSectionProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: LimitField[];
}

export function LimitsSection({ title, open, onOpenChange, fields }: LimitsSectionProps) {
  return (
    <section>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between mb-4 cursor-pointer hover:opacity-70 transition-opacity">
            <h3 className="text-[var(--agyn-dark)] font-semibold">{title}</h3>
            {open ? <ChevronUp className="w-4 h-4 text-[var(--agyn-gray)]" /> : <ChevronDown className="w-4 h-4 text-[var(--agyn-gray)]" />}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4">
            {fields.map((field) => (
              <div key={field.key}>
                <FieldLabel label={field.label} hint={field.hint} />
                <Input
                  type="number"
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
