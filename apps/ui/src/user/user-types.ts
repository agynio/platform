export type User = {
  name: string;
  email: string;
  avatarUrl?: string;
};

export type UserContextType = { user: User | null };

