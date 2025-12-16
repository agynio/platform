import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ContextItemRole, PrismaClient } from '@prisma/client';
import { ContextItemsRepository } from '../src/llm/services/context-items.repository';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!databaseUrl;

if (!shouldRunDbTests) {
  describe.skip('ContextItemsRepository database integration', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  const repository = new ContextItemsRepository(prisma);

  describe.sequential('ContextItemsRepository database integration', () => {
    beforeEach(async () => {
      await prisma.contextItem.deleteMany({});
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('sanitizes null bytes across payload fields during create', async () => {
      const created = await repository.create({
        data: {
          role: ContextItemRole.assistant,
          contentText: 'hello\u0000world',
          contentJson: {
            raw_preview: 'raw\u0000preview',
            blocks: [
              {
                text: 'block\u0000text',
                traces: [{ note: 'note\u0000value' }],
              },
            ],
          },
          metadata: {
            debugLabel: 'label\u0000value',
            nested: [{ tag: 'inner\u0000tag' }],
          },
          sizeBytes: 128,
        },
        select: { id: true },
      });

      const record = await prisma.contextItem.findUniqueOrThrow({ where: { id: created.id } });
      expect(record.contentText).toBe('helloworld');
      expect(JSON.stringify(record.contentJson)).not.toContain('\u0000');
      expect(JSON.stringify(record.metadata)).not.toContain('\u0000');
    });

    it('sanitizes null bytes on update payloads including nested arrays', async () => {
      const base = await prisma.contextItem.create({
        data: {
          role: ContextItemRole.assistant,
          contentText: 'initial',
          contentJson: { raw_preview: 'clean', blocks: [] },
          metadata: { debugLabel: 'clean' },
          sizeBytes: 10,
        },
      });

      await repository.update({
        where: { id: base.id },
        data: {
          contentText: { set: 'update\u0000text' },
          contentJson: {
            raw_preview: 'next\u0000preview',
            blocks: [{ text: 'delta\u0000block', evidence: ['arr\u0000entry'] }],
          },
          metadata: {
            debugLabel: 'after\u0000update',
            auditTrail: [{ reason: 'meta\u0000reason' }],
          },
          sizeBytes: { set: 42 },
        },
      });

      const updated = await prisma.contextItem.findUniqueOrThrow({ where: { id: base.id } });
      expect(updated.contentText).toBe('updatetext');
      expect(JSON.stringify(updated.contentJson)).not.toContain('\u0000');
      expect(JSON.stringify(updated.metadata)).not.toContain('\u0000');
      expect(updated.sizeBytes).toBe(42);
    });
  });
}
