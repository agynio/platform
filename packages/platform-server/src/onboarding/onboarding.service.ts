import { Inject, Injectable } from '@nestjs/common';
import { UserProfileService } from '../user-profile/user-profile.service';
import { OnboardingStepsRegistry } from './onboarding.steps';
import type {
  OnboardingDataSnapshot,
  OnboardingStatusResponse,
  OnboardingStepContext,
} from './onboarding.types';

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(OnboardingStepsRegistry) private readonly stepsRegistry: OnboardingStepsRegistry,
    @Inject(UserProfileService) private readonly userProfileService: UserProfileService,
  ) {}

  async getStatus(): Promise<OnboardingStatusResponse> {
    const snapshot = await this.loadSnapshot();
    return this.computeStatus(snapshot);
  }

  private async loadSnapshot(): Promise<OnboardingDataSnapshot> {
    const profile = await this.userProfileService.getProfile();
    return { profile };
  }

  private computeStatus(snapshot: OnboardingDataSnapshot): OnboardingStatusResponse {
    const steps = this.stepsRegistry.list();
    const requiredSteps: string[] = [];
    const completedSteps: string[] = [];

    for (const step of steps) {
      const context: OnboardingStepContext = {
        data: snapshot,
      };
      const fulfilled = step.isFulfilled(context);
      if (fulfilled) {
        completedSteps.push(step.stepId);
        continue;
      }

      if (step.isRequired(context)) {
        requiredSteps.push(step.stepId);
      }
    }

    return {
      isComplete: requiredSteps.length === 0,
      requiredSteps,
      completedSteps,
      data: snapshot,
    };
  }
}
