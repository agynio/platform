import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AttachmentPreviewStrip } from '../AttachmentPreviewStrip';
import type { Attachment } from '@/hooks/useFileAttachments';

const createAttachment = (overrides: Partial<Attachment> = {}): Attachment => {
  const file = overrides.file ?? new File(['data'], 'notes.txt', { type: 'text/plain' });
  return {
    clientId: 'attachment-1',
    file,
    status: 'uploading',
    progress: 42,
    fileRecord: null,
    error: null,
    ...overrides,
  };
};

describe('AttachmentPreviewStrip', () => {
  it('renders attachments with progress and actions', () => {
    const handleRemove = vi.fn();
    const handleRetry = vi.fn();
    const uploading = createAttachment({ clientId: 'uploading-1' });
    const errorAttachment = createAttachment({
      clientId: 'error-1',
      file: new File(['oops'], 'error.png', { type: 'image/png' }),
      status: 'error',
      progress: 0,
      error: 'Failed to upload',
    });

    render(
      <AttachmentPreviewStrip
        attachments={[uploading, errorAttachment]}
        onRemoveAttachment={handleRemove}
        onRetryAttachment={handleRetry}
      />,
    );

    expect(screen.getByTestId('attachment-preview-strip')).toBeInTheDocument();
    const chips = screen.getAllByTestId('attachment-chip');
    expect(chips).toHaveLength(2);
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText('error.png')).toBeInTheDocument();
    expect(screen.getAllByText('4 B')).toHaveLength(2);

    const progressBar = chips[0]?.querySelector('div[style]') as HTMLElement | null;
    expect(progressBar).toBeTruthy();
    expect(progressBar).toHaveStyle({ width: '42%' });

    fireEvent.click(screen.getByTestId('attachment-retry'));
    expect(handleRetry).toHaveBeenCalledWith('error-1');

    const removeButtons = screen.getAllByTestId('attachment-remove');
    fireEvent.click(removeButtons[0]!);
    expect(handleRemove).toHaveBeenCalledWith('uploading-1');
  });
});
