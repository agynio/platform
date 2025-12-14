import { BadRequestException, Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import semver from 'semver';
import { OnboardingService } from './onboarding.service';
import type { OnboardingProfileInput } from './onboarding.types';

class OnboardingStatusQueryDto {
  @IsString()
  @IsNotEmpty()
  appVersion!: string;
}

class OnboardingProfileDto implements OnboardingProfileInput {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName!: string;

  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email!: string;
}

@Controller('api/onboarding')
export class OnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboardingService: OnboardingService) {}

  @Get('status')
  async getStatus(@Query() query: OnboardingStatusQueryDto) {
    const normalized = normalizeAppVersion(query.appVersion);
    if (!normalized) {
      throw new BadRequestException({ error: 'invalid_app_version' });
    }
    return this.onboardingService.getStatus(normalized);
  }

  @Post('profile')
  async saveProfile(@Body() body: OnboardingProfileDto) {
    return this.onboardingService.saveProfile(body);
  }
}

function normalizeAppVersion(raw: string): string | null {
  if (!raw) return null;
  const direct = semver.valid(raw);
  if (direct) return direct;
  const coerced = semver.coerce(raw);
  return coerced ? coerced.version : null;
}
