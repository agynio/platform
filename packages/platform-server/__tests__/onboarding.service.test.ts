import { describe, expect, it, beforeEach } from 'vitest';
import { OnboardingService } from '../src/onboarding/onboarding.service';
import { OnboardingStepsRegistry } from '../src/onboarding/onboarding.steps';
import type { UserProfileData } from '../src/user-profile/user-profile.types';

class StubUserProfileService {
  constructor(private profile: UserProfileData | null = null) {}

  async getProfile(): Promise<UserProfileData | null> {
    return this.profile;
  }

  setProfile(profile: UserProfileData | null) {
    this.profile = profile;
  }
}

describe('OnboardingService', () => {
  let profileService: StubUserProfileService;
  let service: OnboardingService;

  beforeEach(() => {
    profileService = new StubUserProfileService();
    service = new OnboardingService(new OnboardingStepsRegistry(), profileService as any);
  });

  it('requires profile step when no data exists', async () => {
    const status = await service.getStatus();
    expect(status.isComplete).toBe(false);
    expect(status.requiredSteps).toEqual(['profile.basic_v1']);
    expect(status.completedSteps).toEqual([]);
    expect(status.data.profile).toBeNull();
  });

  it('marks profile step complete when profile data exists', async () => {
    profileService.setProfile({ firstName: 'Casey', lastName: 'Brooks', email: 'casey@example.com' });
    const status = await service.getStatus();
    expect(status.isComplete).toBe(true);
    expect(status.completedSteps).toEqual(['profile.basic_v1']);
    expect(status.requiredSteps).toEqual([]);
    expect(status.data.profile).toEqual({ firstName: 'Casey', lastName: 'Brooks', email: 'casey@example.com' });
  });
});
