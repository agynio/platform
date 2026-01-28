export type AuthMode = 'single_user' | 'oidc';

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl?: string | null;
};

export type UserContextType = {
  user: User | null;
  authenticated: boolean;
  mode: AuthMode;
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};
