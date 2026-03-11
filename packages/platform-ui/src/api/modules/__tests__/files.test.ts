import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({ postMock: vi.fn(), asDataMock: vi.fn() }));

vi.mock('@/api/http', () => ({
  http: { post: hoisted.postMock },
  asData: hoisted.asDataMock,
}));

import { uploadFile } from '@/api/modules/files';

describe('files api', () => {
  beforeEach(() => {
    hoisted.postMock.mockReset();
    hoisted.asDataMock.mockReset();
  });

  it('posts files to /api/files with multipart body', async () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const record = {
      id: 'file-123',
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    };
    hoisted.postMock.mockReturnValue(Promise.resolve(record));
    hoisted.asDataMock.mockImplementation(async (promise: Promise<unknown>) => promise);

    const progressHandler = vi.fn();
    const controller = new AbortController();
    const result = await uploadFile(file, progressHandler, controller.signal);

    expect(hoisted.postMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = hoisted.postMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/files');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect(config).toEqual({
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: progressHandler,
      signal: controller.signal,
    });
    expect(hoisted.asDataMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(record);
  });
});
