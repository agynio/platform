import { Eye, EyeOff, Copy } from 'lucide-react';
import type { SecretEntry } from '@/api/modules/graph';
import { IconButton } from '@/components/IconButton';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      className={`${
        isMissing ? 'bg-[var(--agyn-status-pending-bg)]/50' : 'bg-white'
      }`}
    >
      <TableCell className="px-6 py-4 align-middle">
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
      <TableCell className="px-6 py-4 align-middle">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              type={isReveal ? 'text' : 'password'}
              value={value}
              placeholder={isReveal ? 'Enter secret value' : '••••'}
              onChange={(event) => onValueChange(event.target.value)}
              disabled={isSaving}
              className="max-w-[360px]"
            />
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
              <TooltipContent sideOffset={4}>{revealLabel}</TooltipContent>
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
              <TooltipContent sideOffset={4}>Copy</TooltipContent>
            </Tooltip>
            {isReading && <span className="text-xs text-[var(--agyn-text-subtle)]">Fetching…</span>}
          </div>
        ) : (
          <span className="text-sm text-[var(--agyn-text-subtle)] select-none">••••</span>
        )}
      </TableCell>
      <TableCell className="px-6 py-4 align-middle text-right">
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
