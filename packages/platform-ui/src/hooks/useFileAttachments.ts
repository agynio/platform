import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { uploadFile } from '@/api/modules/files';
import type { FileRecord } from '@/api/types/files';
import { getUuid } from '@/utils/getUuid';

export type AttachmentStatus = 'uploading' | 'completed' | 'error';

export interface Attachment {
  clientId: string;
  file: File;
  status: AttachmentStatus;
  progress: number;
  fileRecord: FileRecord | null;
  error: string | null;
}

type AttachmentAction =
  | { type: 'add'; attachments: Attachment[] }
  | { type: 'update'; clientId: string; updates: Partial<Attachment> }
  | { type: 'remove'; clientId: string }
  | { type: 'clear' };

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SIZE_LIMIT_ERROR = 'File exceeds 20 MB limit.';

const reducer = (state: Attachment[], action: AttachmentAction): Attachment[] => {
  switch (action.type) {
    case 'add':
      return state.concat(action.attachments);
    case 'update': {
      const idx = state.findIndex((attachment) => attachment.clientId === action.clientId);
      if (idx < 0) {
        throw new Error(`Attachment not found: ${action.clientId}`);
      }
      const next = state.slice();
      next[idx] = { ...next[idx], ...action.updates };
      return next;
    }
    case 'remove':
      return state.filter((attachment) => attachment.clientId !== action.clientId);
    case 'clear':
      return [];
  }

  const exhaustiveCheck: never = action;
  throw new Error(`Unhandled attachment action: ${exhaustiveCheck}`);
};

const normalizeProgress = (loaded?: number, total?: number, progress?: number) => {
  let nextValue = 0;
  if (typeof total === 'number' && total > 0 && typeof loaded === 'number') {
    nextValue = Math.round((loaded / total) * 100);
  } else if (typeof progress === 'number') {
    nextValue = Math.round(progress * 100);
  }
  return Math.min(100, Math.max(0, nextValue));
};

const resolveUploadError = (error: unknown) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Failed to upload file.';
};

export interface UseFileAttachmentsReturn {
  attachments: Attachment[];
  isUploading: boolean;
  addFiles: (files: FileList | File[]) => void;
  removeAttachment: (clientId: string) => void;
  retryAttachment: (clientId: string) => void;
  clearAll: () => void;
  completedFileIds: string[];
}

export function useFileAttachments(): UseFileAttachmentsReturn {
  const [attachments, dispatch] = useReducer(reducer, [] as Attachment[]);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const attachmentsRef = useRef<Attachment[]>(attachments);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const abortAll = useCallback(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
  }, []);

  useEffect(() => () => abortAll(), [abortAll]);

  const startUpload = useCallback(async (attachment: Attachment) => {
    const controller = new AbortController();
    controllersRef.current.set(attachment.clientId, controller);

    try {
      const record = await uploadFile(
        attachment.file,
        (event) => {
          if (controller.signal.aborted) return;
          if (controllersRef.current.get(attachment.clientId) !== controller) return;
          const progress = normalizeProgress(event.loaded, event.total, event.progress);
          dispatch({ type: 'update', clientId: attachment.clientId, updates: { progress } });
        },
        controller.signal,
      );

      if (controllersRef.current.get(attachment.clientId) !== controller) {
        return;
      }
      dispatch({
        type: 'update',
        clientId: attachment.clientId,
        updates: { status: 'completed', progress: 100, fileRecord: record, error: null },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (controllersRef.current.get(attachment.clientId) !== controller) {
        return;
      }
      dispatch({
        type: 'update',
        clientId: attachment.clientId,
        updates: { status: 'error', progress: 0, error: resolveUploadError(error) },
      });
    } finally {
      if (controllersRef.current.get(attachment.clientId) === controller) {
        controllersRef.current.delete(attachment.clientId);
      }
    }
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const items = Array.from(files);
      if (items.length === 0) return;

      const nextAttachments = items.map((file) => {
        const clientId = getUuid();
        if (file.size > MAX_FILE_BYTES) {
          return {
            clientId,
            file,
            status: 'error',
            progress: 0,
            fileRecord: null,
            error: SIZE_LIMIT_ERROR,
          } satisfies Attachment;
        }
        return {
          clientId,
          file,
          status: 'uploading',
          progress: 0,
          fileRecord: null,
          error: null,
        } satisfies Attachment;
      });

      dispatch({ type: 'add', attachments: nextAttachments });

      nextAttachments.forEach((attachment) => {
        if (attachment.status === 'uploading') {
          void startUpload(attachment);
        }
      });
    },
    [startUpload],
  );

  const removeAttachment = useCallback((clientId: string) => {
    const controller = controllersRef.current.get(clientId);
    if (controller) {
      controller.abort();
      controllersRef.current.delete(clientId);
    }
    dispatch({ type: 'remove', clientId });
  }, []);

  const retryAttachment = useCallback(
    (clientId: string) => {
      const attachment = attachmentsRef.current.find((item) => item.clientId === clientId);
      if (!attachment || attachment.status !== 'error') {
        return;
      }

      const controller = controllersRef.current.get(clientId);
      if (controller) {
        controller.abort();
        controllersRef.current.delete(clientId);
      }

      dispatch({
        type: 'update',
        clientId,
        updates: { status: 'uploading', progress: 0, fileRecord: null, error: null },
      });
      void startUpload({ ...attachment, status: 'uploading', progress: 0, fileRecord: null, error: null });
    },
    [startUpload],
  );

  const clearAll = useCallback(() => {
    abortAll();
    dispatch({ type: 'clear' });
  }, [abortAll]);

  const isUploading = useMemo(
    () => attachments.some((attachment) => attachment.status === 'uploading'),
    [attachments],
  );

  const completedFileIds = useMemo(
    () =>
      attachments.flatMap((attachment) =>
        attachment.status === 'completed' && attachment.fileRecord
          ? [attachment.fileRecord.id]
          : [],
      ),
    [attachments],
  );

  return {
    attachments,
    isUploading,
    addFiles,
    removeAttachment,
    retryAttachment,
    clearAll,
    completedFileIds,
  };
}
