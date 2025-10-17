import { useState } from 'react';
import { Button, cn } from '@hautech/ui';

// Re-export types for consumers if needed (placeholder to satisfy TS resolution in strict setups)
export type { };

export function ExpandableText({ text, className, limit = 200 }: { text: string; className?: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= limit) {
    return <span className={className}>{text}</span>;
  }
  const visible = open ? text : text.slice(0, limit) + '…';
  return (
    <span className={cn('inline', className)}>
      {visible}{' '}
      <Button type="button" size="sm" variant="link" className="px-0 h-auto underline" onClick={() => setOpen((o) => !o)}>
        {open ? 'show less' : 'show more'}
      </Button>
    </span>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}
