import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import type { SerializeOptions } from 'cookie';
import { PrismaService } from '../core/services/prisma.service';
import { ConfigService } from '../core/services/config.service';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_COOKIE = 'agyn_session';

export type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
};

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly cookieOptions: SerializeOptions;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ConfigService) private readonly config: ConfigService) {
    this.cookieOptions = {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.isProduction,
    };
  }

  async create(userId: string): Promise<SessionRecord> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const session = await this.prisma.getClient().session.create({
      data: {
        id,
        userId,
        expiresAt,
      },
      select: { id: true, userId: true, expiresAt: true },
    });
    return session;
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const session = await this.prisma.getClient().session.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, expiresAt: true },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.safeDelete(session.id);
      return null;
    }
    return session;
  }

  async delete(sessionId: string): Promise<void> {
    await this.safeDelete(sessionId);
  }

  readSessionIdFromRequest(request: FastifyRequest): string | null {
    return this.readSessionIdFromCookieHeader(request.headers.cookie);
  }

  readSessionIdFromCookieHeader(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const cookies = parseCookie(cookieHeader);
    const token = cookies[SESSION_COOKIE];
    return this.decodeCookieValue(token);
  }

  serializeCookie(sessionId: string, expiresAt: Date): string {
    const signed = this.encodeCookieValue(sessionId);
    return serializeCookie(SESSION_COOKIE, signed, { ...this.cookieOptions, expires: expiresAt });
  }

  serializeClearCookie(): string {
    return serializeCookie(SESSION_COOKIE, '', {
      ...this.cookieOptions,
      expires: new Date(0),
    });
  }

  private encodeCookieValue(sessionId: string): string {
    const signature = this.sign(sessionId);
    return `${sessionId}.${signature}`;
  }

  private decodeCookieValue(value: string | undefined): string | null {
    if (!value) return null;
    const [sessionId, signature] = value.split('.');
    if (!sessionId || !signature) return null;
    const expected = this.sign(sessionId);
    if (!this.safeEqual(signature, expected)) {
      this.logger.warn('Session cookie signature mismatch');
      return null;
    }
    return sessionId;
  }

  private sign(value: string): string {
    return createHmac('sha256', this.config.sessionSecret).update(value).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private async safeDelete(sessionId: string): Promise<void> {
    try {
      await this.prisma.getClient().session.delete({ where: { id: sessionId } });
    } catch (error) {
      this.logger.debug(`Session delete ignored: ${(error as Error).message}`);
    }
  }
}
