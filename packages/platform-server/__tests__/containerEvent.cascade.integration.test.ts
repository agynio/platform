import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.AGENTS_DATABASE_URL;
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true' && !!databaseUrl;

if (!shouldRunDbTests) {
  describe.skip('ContainerEvent cascade persistence', () => {
    it('skipped because RUN_DB_TESTS is not true', () => {
      expect(true).toBe(true);
    });
  });
} else {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });

  describe.sequential('ContainerEvent cascade persistence', () => {
    beforeAll(async () => {
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it('deletes container events automatically when container is removed', async () => {
      const containerId = `cid-${randomUUID()}`;

      const container = await prisma.container.create({
        data: {
          containerId,
          dockerContainerId: containerId,
          nodeId: 'cascade-node',
          image: 'hautech/test-image:latest',
          lastUsedAt: new Date(),
        },
      });

      await prisma.containerEvent.create({
        data: {
          containerDbId: container.id,
          eventType: 'die',
          exitCode: 137,
          signal: 'SIGKILL',
          reason: 'SIGKILL',
          message: 'die',
        },
      });

      const beforeDelete = await prisma.containerEvent.count({ where: { containerDbId: container.id } });
      expect(beforeDelete).toBe(1);

      await prisma.container.delete({ where: { id: container.id } });

      const remaining = await prisma.containerEvent.count({ where: { containerDbId: container.id } });
      expect(remaining).toBe(0);
    });
  });
}
