import { Controller, Get, Inject } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';

@Controller('api/onboarding')
export class OnboardingController {
  constructor(@Inject(OnboardingService) private readonly onboardingService: OnboardingService) {}

  @Get('status')
  async getStatus() {
    return this.onboardingService.getStatus();
  }
}
