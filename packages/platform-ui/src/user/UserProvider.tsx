import React from 'react';
import type { UserContextType } from './user-types';
import { UserContext } from './user.runtime';

export function UserProvider({ children }: { children: React.ReactNode }) {
  const value: UserContextType = { user: { name: 'Casey Quinn', email: 'casey@example.com' } };
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
