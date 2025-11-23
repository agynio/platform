import { Eye, EyeOff, Copy } from 'lucide-react';
import type { SecretEntry } from '@/api/modules/graph';
import { IconButton } from '@/components/IconButton';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TableCell, TableRow } from '@/components/ui/table';
import { useRowLogic } from './logic';

interface RowProps {
  entry: SecretEntry;
}

export function Row({ entry }: RowProps) {
  const {
    isEditing,
    isReveal,
    isReading,
    value,
    canSave,
    startEdit,
    cancelEdit,
    toggleReveal,
    onValueChange,
    save,
    copy,
    isSaving,
  } = useRowLogic(entry);

  const isMissing = entry.required && !entry.present;
  const revealLabel = isReveal ? 'Hide' : 'Show';

  return (
    <TableRow
      className={`border-b border-[var(--agyn-border-subtle)] transition-colors hover:bg-[var(--agyn-bg-light)]/50 ${
        isMissing ? 'bg-[var(--agyn-status-pending-bg)]/50' : 'bg-white'
      }`}
    >
      <TableCell className="px-6 h-[60px] align-middle">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-[var(--agyn-dark)] break-all">
            {entry.mount}/{entry.path}/{entry.key}
          </span>
          {isMissing && (
            <Badge variant="warning" size="sm">
              Missing
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="px-6 h-[60px] align-middle">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <div className="w-[360px] max-w-full">
              <Input
                type={isReveal ? 'text' : 'password'}
                value={value}
                placeholder={isReveal ? 'Enter secret value' : '••••'}
                onChange={(event) => onValueChange(event.target.value)}
                disabled={isSaving}
                size="sm"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  icon={isReveal ? <EyeOff /> : <Eye />}
                  size="sm"
                  variant="ghost"
                  onClick={toggleReveal}
                  aria-label={revealLabel}
                  disabled={isSaving || isReading}
                />
              </TooltipTrigger>
              <TooltipContent
                sideOffset={4}
                className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
              >
                {revealLabel}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  icon={<Copy />}
                  size="sm"
                  variant="ghost"
                  onClick={copy}
                  aria-label="Copy"
                  disabled={!isReveal || !value}
                />
              </TooltipTrigger>
              <TooltipContent
                sideOffset={4}
                className="bg-[var(--agyn-dark)] text-white text-xs px-2 py-1 rounded-md"
              >
                Copy
              </TooltipContent>
            </Tooltip>
            {isReading && <span className="text-xs text-[var(--agyn-text-subtle)]">Fetching…</span>}
          </div>
        ) : (
          <span className="text-sm font-mono text-[var(--agyn-dark)] select-none">••••</span>
        )}
      </TableCell>
      <TableCell className="px-6 h-[60px] align-middle text-right">
        {isEditing ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={save} disabled={!canSave}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="outline" onClick={cancelEdit} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={startEdit}>
            Edit
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
