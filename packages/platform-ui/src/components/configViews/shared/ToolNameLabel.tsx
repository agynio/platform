import { Info } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TOOL_NAME_HINT } from '@/components/nodeProperties/toolNameHint';

interface ToolNameLabelProps {
  htmlFor?: string;
}

export function ToolNameLabel({ htmlFor }: ToolNameLabelProps) {
  return (
    <label htmlFor={htmlFor} className="block text-xs mb-1 flex items-center gap-1">
      Name (optional)
      <Tooltip>
        <TooltipTrigger className="cursor-help" aria-label={TOOL_NAME_HINT} title={TOOL_NAME_HINT}>
          <Info className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{TOOL_NAME_HINT}</TooltipContent>
      </Tooltip>
    </label>
  );
}
