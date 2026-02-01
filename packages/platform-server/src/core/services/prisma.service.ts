import { ConfigService } from './config.service';
import { registerPostgresSanitizerMiddleware } from '../../common/sanitize/postgres-text.sanitize';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService {
  // Lazy-initialized Prisma client; optional to avoid non-null assertion
  private prisma?: PrismaClient;
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(ConfigService) private cfg: ConfigService) {}

  getClient(): PrismaClient {
    try {
      if (!this.prisma) {
        const url = this.cfg.agentsDatabaseUrl;
        this.prisma = new PrismaClient({ datasources: { db: { url } } });
        registerPostgresSanitizerMiddleware(this.prisma);
      }
      return this.prisma;
    } catch (error) {
      this.logger.error('Failed to initialize Prisma client', error);
      throw error;
    }
  }
}
