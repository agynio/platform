import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingStepsRegistry } from './onboarding.steps';

@Module({
  imports: [CoreModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingStepsRegistry],
})
export class OnboardingModule {}
