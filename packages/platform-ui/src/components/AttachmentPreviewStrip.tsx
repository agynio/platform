import { AlertCircle, File, RotateCw, X } from 'lucide-react';
import { IconButton } from './IconButton';
import { formatFileSize } from '@/utils/formatFileSize';
import type { Attachment } from '@/hooks/useFileAttachments';

interface AttachmentPreviewStripProps {
  attachments: Attachment[];
  onRemoveAttachment?: (clientId: string) => void;
  onRetryAttachment?: (clientId: string) => void;
}

const formatProgress = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
};

export function AttachmentPreviewStrip({
  attachments,
  onRemoveAttachment,
  onRetryAttachment,
}: AttachmentPreviewStripProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="attachment-preview-strip">
      {attachments.map((attachment) => {
        const isError = attachment.status === 'error';
        const isUploading = attachment.status === 'uploading';
        const filename = attachment.file.name;
        const progress = formatProgress(attachment.progress);

        return (
          <div
            key={attachment.clientId}
            data-testid="attachment-chip"
            className={[
              'relative flex min-w-[180px] items-center gap-2 rounded-[10px] border px-2 py-1.5 text-xs',
              isError
                ? 'border-[var(--agyn-status-failed)] bg-[var(--agyn-status-failed-bg)]'
                : 'border-[var(--agyn-border-subtle)] bg-white',
            ].join(' ')}
          >
            <File className="h-4 w-4 text-[var(--agyn-gray)]" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="max-w-[160px] truncate text-[11px] text-[var(--agyn-dark)]">
                {filename}
              </span>
              <span className="text-[10px] text-[var(--agyn-gray)]">
                {formatFileSize(attachment.file.size)}
              </span>
            </div>
            {isError ? (
              <AlertCircle className="h-4 w-4 text-[var(--agyn-status-failed)]" aria-hidden="true" />
            ) : null}
            {isError && onRetryAttachment ? (
              <IconButton
                icon={<RotateCw className="h-3 w-3" />}
                size="xs"
                variant="ghost"
                className="text-[var(--agyn-status-failed)]"
                onClick={() => onRetryAttachment(attachment.clientId)}
                aria-label={`Retry upload for ${filename}`}
                data-testid="attachment-retry"
              />
            ) : null}
            {onRemoveAttachment ? (
              <IconButton
                icon={<X className="h-3 w-3" />}
                size="xs"
                variant="ghost"
                className={isError ? 'text-[var(--agyn-status-failed)]' : ''}
                onClick={() => onRemoveAttachment(attachment.clientId)}
                aria-label={`Remove ${filename}`}
                data-testid="attachment-remove"
              />
            ) : null}
            {isUploading ? (
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--agyn-border-subtle)]">
                <div className="h-full bg-[var(--agyn-blue)]" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
