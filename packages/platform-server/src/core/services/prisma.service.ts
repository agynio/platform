import { createRequire } from 'module';
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PrismaService {
  // Lazy-initialized Prisma client; optional to avoid non-null assertion
  private prisma?: any;

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(ConfigService) private cfg: ConfigService,
  ) {}

  getClient(): any {
    try {
      if (!this.prisma) {
        const url = this.cfg.agentsDatabaseUrl;
        // Load PrismaClient via createRequire to avoid static ESM import at compile time
        const require = createRequire(import.meta.url);
        const { PrismaClient } = require('@prisma/client');
        this.prisma = new PrismaClient({ datasources: { db: { url } } });
      }
      return this.prisma;
    } catch (e) {
      this.logger.error('Failed to initialize Prisma client: %s', (e as Error)?.message || String(e));
      throw e;
    }
  }
}
