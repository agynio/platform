import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFileAttachments } from '../useFileAttachments';
import type { FileRecord } from '@/api/types/files';

const hoisted = vi.hoisted(() => ({ uploadFileMock: vi.fn() }));

vi.mock('@/api/modules/files', () => ({
  uploadFile: hoisted.uploadFileMock,
}));

const createFileRecord = (file: File, overrides: Partial<FileRecord> = {}): FileRecord => ({
  id: 'file-id',
  filename: file.name,
  contentType: file.type,
  sizeBytes: file.size,
  ...overrides,
});

describe('useFileAttachments', () => {
  beforeEach(() => {
    hoisted.uploadFileMock.mockReset();
  });

  it('uploads files and tracks completion', async () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const record = createFileRecord(file, { id: 'file-1' });

    hoisted.uploadFileMock.mockImplementation(async (_file: File, onUploadProgress?: (event: unknown) => void) => {
      onUploadProgress?.({ loaded: 1, total: 2, progress: 0.5 });
      return record;
    });

    const { result } = renderHook(() => useFileAttachments());

    act(() => {
      result.current.addFiles([file]);
    });

    expect(result.current.isUploading).toBe(true);
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0]?.status).toBe('uploading');
    expect(result.current.attachments[0]?.progress).toBe(50);

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.attachments[0]?.status).toBe('completed');
    expect(result.current.attachments[0]?.progress).toBe(100);
    expect(result.current.completedFileIds).toEqual(['file-1']);
    expect(result.current.isUploading).toBe(false);
  });

  it('rejects files larger than 20 MB', () => {
    const largeFile = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.txt', { type: 'text/plain' });
    const { result } = renderHook(() => useFileAttachments());

    act(() => {
      result.current.addFiles([largeFile]);
    });

    expect(hoisted.uploadFileMock).not.toHaveBeenCalled();
    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0]?.status).toBe('error');
    expect(result.current.attachments[0]?.error).toBe('File exceeds 20 MB limit.');
  });

  it('retries failed uploads', async () => {
    const file = new File(['oops'], 'retry.txt', { type: 'text/plain' });
    const record = createFileRecord(file, { id: 'file-2' });

    hoisted.uploadFileMock
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(record);

    const { result } = renderHook(() => useFileAttachments());

    act(() => {
      result.current.addFiles([file]);
    });

    await act(async () => {
      await Promise.resolve();
    });

    const attachment = result.current.attachments[0];
    expect(attachment?.status).toBe('error');

    act(() => {
      result.current.retryAttachment(attachment!.clientId);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.attachments[0]?.status).toBe('completed');
    expect(result.current.completedFileIds).toEqual(['file-2']);
  });
});
