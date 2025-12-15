import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient, UserProfile } from '@prisma/client';
import type { PrismaService } from '../src/core/services/prisma.service';
import { UserProfileService } from '../src/user-profile/user-profile.service';

class FakePrismaClient {
  private profile: UserProfile | null = null;

  userProfile = {
    findUnique: async () => (this.profile ? { ...this.profile } : null),
    upsert: async ({ create, update }: { create: Partial<UserProfile>; update: Partial<UserProfile> }) => {
      if (!this.profile) {
        this.profile = {
          id: (create.id as number) ?? 1,
          firstName: (create.firstName ?? '') as string,
          lastName: (create.lastName ?? '') as string,
          email: (create.email ?? '') as string,
          createdAt: new Date(),
          updatedAt: new Date(),
        } satisfies UserProfile;
      } else {
        this.profile = {
          ...this.profile,
          firstName: (update.firstName ?? this.profile.firstName) as string,
          lastName: (update.lastName ?? this.profile.lastName) as string,
          email: (update.email ?? this.profile.email) as string,
          updatedAt: new Date(),
        } satisfies UserProfile;
      }
      return { ...this.profile };
    },
  };
}

class FakePrismaService implements Pick<PrismaService, 'getClient'> {
  constructor(private readonly client: FakePrismaClient) {}

  getClient(): PrismaClient {
    return this.client as unknown as PrismaClient;
  }
}

describe('UserProfileService', () => {
  let prisma: FakePrismaClient;
  let service: UserProfileService;

  beforeEach(() => {
    prisma = new FakePrismaClient();
    service = new UserProfileService(new FakePrismaService(prisma) as unknown as PrismaService);
  });

  it('returns null when no profile exists', async () => {
    const profile = await service.getProfile();
    expect(profile).toBeNull();
  });

  it('upserts and normalizes profile data', async () => {
    const saved = await service.saveProfile({
      firstName: ' Casey ',
      lastName: ' Brooks ',
      email: 'CASEY@EXAMPLE.COM ',
    });

    expect(saved).toEqual({ firstName: 'Casey', lastName: 'Brooks', email: 'casey@example.com' });

    const persisted = await service.getProfile();
    expect(persisted).toEqual(saved);
  });
});
