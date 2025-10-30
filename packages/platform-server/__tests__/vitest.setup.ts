import { vi } from 'vitest';

// Mock Prisma client to avoid requiring generated binaries/artifacts in unit tests
vi.mock('@prisma/client', () => {
  class PrismaClient {
    constructor(_opts?: unknown) {}
  }
  return { PrismaClient };
});

