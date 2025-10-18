import React from 'react';
import type { User, UserContextType } from './user-types';
import { UserContext } from './user.runtime';

export function UserProvider({ children }: { children: React.ReactNode }) {
  const value: UserContextType = { user: { name: 'Casey Quinn', email: 'casey@example.com' } as User };
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

