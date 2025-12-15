import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, UserProfile as UserProfileModel } from '@prisma/client';
import { PrismaService } from '../core/services/prisma.service';
import type { UserProfileData, UserProfileInput } from './user-profile.types';

const USER_PROFILE_SINGLETON_ID = 1;

@Injectable()
export class UserProfileService {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  private get prisma(): PrismaClient {
    return this.prismaService.getClient();
  }

  async getProfile(): Promise<UserProfileData | null> {
    const record = await this.prisma.userProfile.findUnique({ where: { id: USER_PROFILE_SINGLETON_ID } });
    return record ? this.mapRecord(record) : null;
  }

  async saveProfile(input: UserProfileInput): Promise<UserProfileData> {
    const normalized = this.normalizeInput(input);
    const record = await this.prisma.userProfile.upsert({
      where: { id: USER_PROFILE_SINGLETON_ID },
      create: { id: USER_PROFILE_SINGLETON_ID, ...normalized },
      update: { ...normalized },
    });
    return this.mapRecord(record);
  }

  private mapRecord(record: UserProfileModel): UserProfileData {
    return {
      firstName: record.firstName.trim(),
      lastName: record.lastName.trim(),
      email: record.email.trim().toLowerCase(),
    };
  }

  private normalizeInput(input: UserProfileInput): UserProfileInput {
    return {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
    };
  }
}
