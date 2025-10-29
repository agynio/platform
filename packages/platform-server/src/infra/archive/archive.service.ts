import { Injectable } from '@nestjs/common';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { pack } from 'tar-stream';

@Injectable()
export class ArchiveService {
  /**
   * Create a tar archive Buffer containing a single UTF-8 text file.
   * Suitable for Docker putArchive; extracted into the destination path.
   */
  async createSingleFileTar(fileName: string, content: string, mode = 0o644): Promise<Buffer> {
    if (!fileName || typeof fileName !== 'string') throw new Error('fileName is required');
    const tar = pack();
    const chunks: Buffer[] = [];

    const entryPromise = new Promise<void>((resolve, reject) => {
      const buf = Buffer.from(content, 'utf8');
      tar.entry({ name: fileName, size: buf.length, mode }, buf, (err?: Error | null) => {
        if (err) return reject(err);
        tar.finalize();
        resolve();
      });
    });

    const collectPromise = new Promise<Buffer>((resolve, reject) => {
      const stream: NodeJS.ReadableStream = Readable.from(tar);
      stream
        .on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))))
        .on('error', (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))))
        .on('end', () => resolve(Buffer.concat(chunks)));
    });

    await entryPromise;
    return collectPromise;
  }
}

