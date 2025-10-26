import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { pack } from 'tar-stream';

/**
 * Create a tar archive Buffer containing a single UTF-8 text file.
 * The resulting tarball is suitable for docker putArchive.
 */
export async function createSingleFileTar(filename: string, content: string): Promise<Buffer> {
  if (!filename || typeof filename !== 'string') throw new Error('filename is required');
  const tar = pack();
  const chunks: Buffer[] = [];

  const entryPromise = new Promise<void>((resolve, reject) => {
    const buf = Buffer.from(content, 'utf8');
    tar.entry({ name: filename, size: buf.length, mode: 0o644 }, buf, (err?: Error | null) => {
      if (err) return reject(err);
      tar.finalize();
      resolve();
    });
  });

  const collectPromise = new Promise<Buffer>((resolve, reject) => {
    const stream: NodeJS.ReadableStream = Readable.from(tar);
    stream
      .on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))) )
      .on('error', (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))) )
      .on('end', () => resolve(Buffer.concat(chunks)) );
  });

  await entryPromise;
  return collectPromise;
}
