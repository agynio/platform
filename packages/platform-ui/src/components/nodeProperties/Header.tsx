import { Play, Square } from 'lucide-react';

import Badge from '../Badge';
import { IconButton } from '../IconButton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

import { statusConfig } from './constants';
import type { NodeStatus } from './types';

interface HeaderProps {
  title: string;
  status: NodeStatus;
  errorDetail?: string;
  canProvision?: boolean;
  canDeprovision?: boolean;
  isActionPending?: boolean;
  onProvision?: () => void;
  onDeprovision?: () => void;
}

const ERROR_FALLBACK_MESSAGE = 'Node failed to initialize. No additional error details available.';

export function Header({
  title,
  status,
  errorDetail,
  canProvision = false,
  canDeprovision = false,
  isActionPending = false,
  onProvision,
  onDeprovision,
}: HeaderProps) {
  const statusInfo = statusConfig[status];
  const isErrorStatus = status === 'provisioning_error' || status === 'deprovisioning_error';
  const trimmedDetail = typeof errorDetail === 'string' ? errorDetail.trim() : '';
  const tooltipMessage = trimmedDetail.length > 0 ? trimmedDetail : ERROR_FALLBACK_MESSAGE;
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
  const badge = (
    <Badge color={statusInfo.color} bgColor={statusInfo.bgColor}>
      {statusInfo.label}
    </Badge>
  );
  const badgeWithTooltip = isErrorStatus ? (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--agyn-status-failed)]"
            aria-label="View node error details"
            title="View node error details"
          >
            {badge}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={6}
          align="center"
          className="max-w-[360px] whitespace-pre-wrap break-words text-left leading-relaxed"
        >
          <p>{tooltipMessage}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : (
    badge
  );

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--agyn-border-default)]">
      <div>
        <h2 className="text-[var(--agyn-dark)]">Node Properties</h2>
        <p className="text-sm text-[var(--agyn-gray)] mt-0.5">{title}</p>
      </div>
      <div className="flex items-center gap-3">
        {badgeWithTooltip}
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
