import React from 'react';
import type { UserContextType } from './user-types';

// Runtime-only context container; no components are exported here.
const noop = () => {};
const noopAsync = async () => {};

export const UserContext = React.createContext<UserContextType>({
  user: null,
  authenticated: false,
  mode: 'single_user',
  loading: true,
  error: null,
  login: noop,
  logout: noopAsync,
  refresh: noopAsync,
});

export function useUser() {
  return React.useContext(UserContext);
}
