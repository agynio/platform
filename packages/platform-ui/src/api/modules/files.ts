import type { AxiosProgressEvent } from 'axios';
import { http, asData } from '@/api/http';
import type { FileRecord } from '@/api/types/files';

export type UploadProgressHandler = (event: AxiosProgressEvent) => void;

export function uploadFile(
  file: File,
  onUploadProgress?: UploadProgressHandler,
  signal?: AbortSignal,
) {
  const formData = new FormData();
  formData.append('file', file);

  return asData<FileRecord>(
    http.post<FileRecord>('/api/files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
      signal,
    }),
  );
}
