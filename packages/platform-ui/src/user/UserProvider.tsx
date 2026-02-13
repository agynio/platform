import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { config } from '@/config';
import * as authApi from '@/api/modules/auth';
import type { AuthStatusResponse } from '@/api/modules/auth';
import type { User, UserContextType } from './user-types';
import { UserContext } from './user.runtime';

type AuthState = {
  user: User | null;
  authenticated: boolean;
  mode: authApi.AuthMode;
  loading: boolean;
  error: string | null;
};

const initialState: AuthState = {
  user: null,
  authenticated: false,
  mode: 'single_user',
  loading: true,
  error: null,
};

function mapUser(payload: AuthStatusResponse['user']): User | null {
  if (!payload) return null;
  return {
    id: payload.id,
    email: payload.email ?? null,
    name: payload.name ?? payload.email ?? null,
    avatarUrl: null,
  };
}

type SplashProps = {
  title: string;
  description?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  error?: string | null;
};

function AuthSplash({ title, description, primaryLabel, onPrimary, secondaryLabel, onSecondary, error }: SplashProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--agyn-bg-light)] px-6 text-center">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-[var(--agyn-border-subtle)] p-8 space-y-4">
        <div className="text-2xl font-semibold text-[var(--agyn-dark)]">{title}</div>
        {description ? <p className="text-[var(--agyn-gray)] text-sm leading-relaxed">{description}</p> : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <div className="flex flex-col gap-3 pt-2">
          {primaryLabel ? (
            <button
              type="button"
              onClick={onPrimary}
              className="h-11 rounded-lg bg-[var(--agyn-blue)] text-white font-medium hover:opacity-90"
            >
              {primaryLabel}
            </button>
          ) : null}
          {secondaryLabel ? (
            <button
              type="button"
              onClick={onSecondary}
              className="h-11 rounded-lg border border-[var(--agyn-border-subtle)] text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)]"
            >
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function createBypassValue(): UserContextType {
  return {
    user: {
      id: 'mock-user',
      name: 'Agyn User',
      email: 'user@example.com',
      avatarUrl: null,
    },
    authenticated: true,
    mode: 'single_user',
    loading: false,
    error: null,
    login: () => {},
    logout: async () => {},
    refresh: async () => {},
  };
}

function AuthenticatedUserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const status = await authApi.getAuthStatus();
      setState({
        user: mapUser(status.user),
        authenticated: status.authenticated,
        mode: status.mode,
        loading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach authentication service';
      setState((prev) => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(() => {
    const url = `${config.apiBaseUrl}/api/auth/login`;
    window.location.assign(url);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      await refresh();
    }
  }, [refresh]);

  const contextValue = useMemo<UserContextType>(
    () => ({
      user: state.user,
      authenticated: state.authenticated,
      mode: state.mode,
      loading: state.loading,
      error: state.error,
      login,
      logout,
      refresh,
    }),
    [state, login, logout, refresh],
  );

  if (state.loading) {
    return (
      <AuthSplash title="Signing you in" description="Checking your session..." secondaryLabel="Retry" onSecondary={refresh} />
    );
  }

  if (state.error && !state.authenticated) {
    return (
      <AuthSplash
        title="Unable to reach Agyn Platform"
        description="We could not verify your session."
        primaryLabel="Retry"
        onPrimary={refresh}
        error={state.error}
      />
    );
  }

  if (state.mode === 'oidc' && !state.authenticated) {
    return (
      <AuthSplash
        title="Sign in to continue"
        description="Your Agyn Platform session has ended. Continue with your identity provider to resume."
        primaryLabel="Continue with SSO"
        onPrimary={login}
        secondaryLabel="Retry"
        onSecondary={refresh}
      />
    );
  }

  return <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  const bypassAuth = env?.MODE === 'test' || env?.STORYBOOK === 'true';

  if (bypassAuth) {
    const value = createBypassValue();
    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
  }

  return <AuthenticatedUserProvider>{children}</AuthenticatedUserProvider>;
}
