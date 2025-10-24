import { LoggerService } from './logger.service';

export class PrismaService {
  private static _instance: PrismaService | null = null;
  private prisma: any | null = null; // runtime-typed to avoid top-level import

  private constructor(private logger: LoggerService) {}

  static getInstance(logger: LoggerService): PrismaService {
    if (!this._instance) this._instance = new PrismaService(logger);
    return this._instance;
  }

  async getClient(): Promise<any | null> {
    try {
      if (!this.prisma) {
        const url = process.env.AGENTS_DATABASE_URL;
        if (!url) {
          this.logger.debug?.('AGENTS_DATABASE_URL not set; Prisma features disabled');
          return null;
        }
        const mod = await import('@prisma/client');
        const PrismaClient = (mod as any).PrismaClient;
        this.prisma = new PrismaClient({ datasources: { db: { url } } });
      }
      return this.prisma;
    } catch (e) {
      this.logger.error('Failed to initialize Prisma client: %s', (e as Error)?.message || String(e));
      return null;
    }
  }
}
