import { asData, http } from '../http';

export type AuthMode = 'single_user' | 'oidc';

export type AuthStatusResponse = {
  mode: AuthMode;
  authenticated: boolean;
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
};

export async function getAuthStatus(): Promise<AuthStatusResponse> {
  return asData<AuthStatusResponse>(http.get('/api/auth/status'));
}

export async function logout(): Promise<void> {
  await http.post('/api/auth/logout');
}
