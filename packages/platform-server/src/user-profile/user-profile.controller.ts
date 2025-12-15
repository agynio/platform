import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { UserProfileService } from './user-profile.service';
import type { UserProfileInput } from './user-profile.types';

class UserProfileDto implements UserProfileInput {
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

@Controller('api/user-profile')
export class UserProfileController {
  constructor(@Inject(UserProfileService) private readonly userProfileService: UserProfileService) {}

  @Get()
  async getProfile() {
    const profile = await this.userProfileService.getProfile();
    return { profile };
  }

  @Post()
  async saveProfile(@Body() body: UserProfileDto) {
    const profile = await this.userProfileService.saveProfile(body);
    return { profile };
  }
}
