import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
type UserSummary = Pick<User, 'id' | 'email' | 'name'>;

@Injectable()
export class UserService {
  private readonly includeSelect = { id: true, email: true, name: true } satisfies Prisma.UserSelect;
  private defaultUserPromise: Promise<UserSummary> | null = null;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get defaultUserId(): string {
    return DEFAULT_USER_ID;
  }

  async ensureDefaultUser(): Promise<UserSummary> {
    if (!this.defaultUserPromise) {
      this.defaultUserPromise = this.prisma.getClient().user.upsert({
        where: { id: DEFAULT_USER_ID },
        update: { updatedAt: new Date() },
        create: {
          id: DEFAULT_USER_ID,
          email: 'default@local',
          name: 'Default User',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        select: this.includeSelect,
      });
    }
    return this.defaultUserPromise;
  }

  async getById(id: string): Promise<UserSummary | null> {
    const user = await this.prisma.getClient().user.findUnique({ where: { id }, select: this.includeSelect });
    return user;
  }

  async upsertOidcUser(params: { issuer: string; subject: string; email?: string | null; name?: string | null }): Promise<UserSummary> {
    const now = new Date();
    const identityKey: Prisma.UserWhereUniqueInput = {
      oidcIssuer_oidcSubject: { oidcIssuer: params.issuer, oidcSubject: params.subject },
    };
    const user = await this.prisma.getClient().user.upsert({
      where: identityKey,
      update: {
        email: params.email ?? undefined,
        name: params.name ?? undefined,
        updatedAt: now,
      },
      create: {
        email: params.email ?? null,
        name: params.name ?? null,
        oidcIssuer: params.issuer,
        oidcSubject: params.subject,
        createdAt: now,
        updatedAt: now,
      },
      select: this.includeSelect,
    });
    return user;
  }
}
