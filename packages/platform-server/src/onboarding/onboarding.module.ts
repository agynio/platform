import { Module } from '@nestjs/common';
import { UserProfileModule } from '../user-profile/user-profile.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingStepsRegistry } from './onboarding.steps';

@Module({
  imports: [UserProfileModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingStepsRegistry],
})
export class OnboardingModule {}
