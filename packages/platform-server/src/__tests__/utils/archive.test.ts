import { describe, it, expect } from 'vitest';
import { createSingleFileTar } from '../../utils/archive';
import { extract } from 'tar-stream';

describe('archive.createSingleFileTar', () => {
  it('creates a tar with a single file containing exact content', async () => {
    const filename = 'test.txt';
    const content = 'hello world';
    const buf = await createSingleFileTar(filename, content);
    // Extract and verify
    const e = extract();
    const seen: { name: string; data: string }[] = [];
    await new Promise<void>((resolve, reject) => {
      e.on('entry', (header: any, stream: NodeJS.ReadableStream, next: () => void) => {
        const chunks: Buffer[] = [];
        (stream as any).on('data', (c: Buffer) => chunks.push(c));
        (stream as any).on('end', () => {
          seen.push({ name: header.name, data: Buffer.concat(chunks).toString('utf8') });
          next();
        });
        (stream as any).on('error', reject);
      });
      e.on('finish', () => resolve());
      e.on('error', reject);
      e.end(buf);
    });
    expect(seen.length).toBe(1);
    expect(seen[0].name).toBe(filename);
    expect(seen[0].data).toBe(content);
  });
});
