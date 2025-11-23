import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryController } from '../src/graph/controllers/memory.controller';
import { HttpException } from '@nestjs/common';
import type { MemoryScope } from '../src/nodes/memory/memory.types';
import type { MemoryService } from '../src/nodes/memory/memory.service';

type MemoryServiceStub = {
  listDocs: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  ensureDir: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  dump: ReturnType<typeof vi.fn>;
};

const createServiceStub = (): MemoryServiceStub => ({
  listDocs: vi.fn(),
  list: vi.fn(),
  stat: vi.fn(),
  read: vi.fn(),
  append: vi.fn(),
  update: vi.fn(),
  ensureDir: vi.fn(),
  delete: vi.fn(),
  dump: vi.fn(),
});

describe('MemoryController', () => {
  let service: MemoryServiceStub;
  let controller: MemoryController;

  beforeEach(() => {
    service = createServiceStub();
    controller = new MemoryController(service as unknown as MemoryService);
  });

  it('listDocs returns service payload', async () => {
    service.listDocs.mockResolvedValue([
      { nodeId: 'a', scope: 'global' as MemoryScope },
      { nodeId: 'b', scope: 'perThread' as MemoryScope, threadId: 'thread-1' },
    ]);

    const result = await controller.listDocs();

    expect(service.listDocs).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      items: [
        { nodeId: 'a', scope: 'global' },
        { nodeId: 'b', scope: 'perThread', threadId: 'thread-1' },
      ],
    });
  });

  it('append requires thread id for perThread scope', async () => {
    await expect(
      controller.append({ nodeId: 'node', scope: 'perThread' } as any, { path: '/note.txt', data: 'hello' } as any, {} as any),
    ).rejects.toBeInstanceOf(HttpException);
    expect(service.append).not.toHaveBeenCalled();
  });

  it('append trims provided thread id', async () => {
    service.append.mockResolvedValue(undefined);

    await controller.append(
      { nodeId: 'node', scope: 'perThread' } as any,
      { path: '/note.txt', data: 'hello', threadId: ' thread-1 ' } as any,
      {} as any,
    );

    expect(service.append).toHaveBeenCalledWith('node', 'perThread', 'thread-1', '/note.txt', 'hello');
  });

  it('list forwards defaults and thread resolution for global scope', async () => {
    service.list.mockResolvedValue([{ name: 'logs', hasSubdocs: true }]);

    const result = await controller.list({ nodeId: 'node', scope: 'global' } as any, {} as any);

    expect(service.list).toHaveBeenCalledWith('node', 'global', undefined, '/');
    expect(result).toEqual({ items: [{ name: 'logs', hasSubdocs: true }] });
  });

  it('read passes through content', async () => {
    service.read.mockResolvedValueOnce('hello world');
    const ok = await controller.read({ nodeId: 'node', scope: 'global' } as any, { path: '/note.txt' } as any);
    expect(ok).toEqual({ content: 'hello world' });
  });

  it('read allows root path', async () => {
    service.read.mockResolvedValueOnce('');

    const ok = await controller.read({ nodeId: 'node', scope: 'global' } as any, { path: '/' } as any);

    expect(service.read).toHaveBeenCalledWith('node', 'global', undefined, '/');
    expect(ok).toEqual({ content: '' });
  });

  it('read maps ENOENT to 404', async () => {
    service.read.mockRejectedValueOnce(new Error('ENOENT: missing'));

    await expect(controller.read({ nodeId: 'node', scope: 'global' } as any, { path: '/missing' } as any)).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
      return true;
    });
  });

  it('update maps service errors and returns replaced count', async () => {
    service.update.mockResolvedValueOnce(2);
    const ok = await controller.update(
      { nodeId: 'node', scope: 'perThread' } as any,
      { path: '/note.txt', oldStr: 'a', newStr: 'b', threadId: ' thread-1 ' } as any,
      {} as any,
    );
    expect(ok).toEqual({ replaced: 2 });
    expect(service.update).toHaveBeenCalledWith('node', 'perThread', 'thread-1', '/note.txt', 'a', 'b');

    service.update.mockRejectedValueOnce(new Error('ENOENT: missing'));
    await expect(
      controller.update(
        { nodeId: 'node', scope: 'perThread' } as any,
        { path: '/note.txt', oldStr: 'a', newStr: 'b', threadId: 'thread-1' } as any,
        {} as any,
      ),
    ).rejects.toSatisfy((err) => {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
      return true;
    });
  });

  it('delete delegates to service', async () => {
    service.delete.mockResolvedValue({ removed: 1 });

    const result = await controller.remove({ nodeId: 'node', scope: 'global' } as any, { path: '/file.txt' } as any);

    expect(service.delete).toHaveBeenCalledWith('node', 'global', undefined, '/file.txt');
    expect(result).toEqual({ removed: 1 });
  });

  it('dump delegates to service with resolved thread id', async () => {
    const payload = { nodeId: 'node', scope: 'perThread' as MemoryScope, threadId: 'thread-1', data: {}, dirs: {} };
    service.dump.mockResolvedValue(payload);

    const result = await controller.dump({ nodeId: 'node', scope: 'perThread' } as any, { threadId: ' thread-1 ' } as any);

    expect(service.dump).toHaveBeenCalledWith('node', 'perThread', 'thread-1');
    expect(result).toBe(payload);
  });
});
