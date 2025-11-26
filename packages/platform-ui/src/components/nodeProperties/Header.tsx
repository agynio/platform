import { Play, Square } from 'lucide-react';

import Badge from '../Badge';
import { IconButton } from '../IconButton';

import { statusConfig } from './constants';
import type { NodeStatus } from './types';

interface HeaderProps {
  title: string;
  status: NodeStatus;
  canProvision?: boolean;
  canDeprovision?: boolean;
  isActionPending?: boolean;
  onProvision?: () => void;
  onDeprovision?: () => void;
}

export function Header({
  title,
  status,
  canProvision = false,
  canDeprovision = false,
  isActionPending = false,
  onProvision,
  onDeprovision,
}: HeaderProps) {
  const statusInfo = statusConfig[status];
  const handleClick = () => {
    if (isActionPending) return;
    if (canProvision) {
      onProvision?.();
      return;
    }
    if (canDeprovision) {
      onDeprovision?.();
    }
  };

  const disabled = (!canProvision && !canDeprovision) || isActionPending;
  const actionLabel = canProvision
    ? 'Provision node'
    : canDeprovision
      ? 'Deprovision node'
      : 'Node action unavailable';

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-default)]">
      <div>
        <h2 className="text-[var(--agyn-dark)]">Node Properties</h2>
        <p className="text-sm text-[var(--agyn-gray)] mt-0.5">{title}</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge color={statusInfo.color} bgColor={statusInfo.bgColor}>
          {statusInfo.label}
        </Badge>
        <IconButton
          icon={canProvision ? <Play className="w-5 h-5" /> : <Square className="w-5 h-5" />}
          variant="ghost"
          size="md"
          disabled={disabled}
          onClick={handleClick}
          aria-label={actionLabel}
          title={actionLabel}
        />
      </div>
    </div>
  );
}
