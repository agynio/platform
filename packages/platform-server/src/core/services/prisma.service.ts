import type { PrismaClient } from '@prisma/client';
import { LoggerService } from './logger.service';
import { ConfigService } from './config.service';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PrismaService {
  // Definite assignment: initialized lazily in getClient()
  private prisma!: PrismaClient;

  constructor(
    @Inject(LoggerService) private logger: LoggerService,
    @Inject(ConfigService) private cfg: ConfigService,
  ) {}

  getClient(): PrismaClient {
    try {
      if (!this.prisma) {
        const url = this.cfg.agentsDatabaseUrl;
        // Import PrismaClient lazily to avoid requiring generated client in test environments
        // eslint-disable-next-line @typescript-eslint/no-var-requires
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
