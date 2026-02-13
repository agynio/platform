import type { UserService } from '../../src/auth/user.service';

export function createUserServiceStub(overrides?: Partial<UserService>): UserService {
  const base = {
    ensureDefaultUser: async () => ({ id: 'user-default' }),
  } as Partial<UserService>;
  return { ...base, ...overrides } as UserService;
}
