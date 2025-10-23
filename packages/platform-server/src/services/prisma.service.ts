import { PrismaClient } from '@prisma/client';
import { LoggerService } from './logger.service';

export class PrismaService {
  private static instance: PrismaService | null = null;
  private prisma: PrismaClient | null = null;

  private constructor(private logger: LoggerService) {}

  static getInstance(logger: LoggerService) {
    if (!this.instance) this.instance = new PrismaService(logger);
    return this.instance;
  }

  getClient(): PrismaClient | null {
    try {
      if (!this.prisma) {
        const url = process.env.AGENTS_DATABASE_URL;
        if (!url) {
          this.logger.debug?.('AGENTS_DATABASE_URL not set; Prisma features disabled');
          return null;
        }
        this.prisma = new PrismaClient({ datasources: { db: { url } } });
      }
      return this.prisma;
    } catch (e) {
      this.logger.error('Failed to initialize Prisma client: %s', (e as Error)?.message || String(e));
      return null;
    }
  }
}

