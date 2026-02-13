import { type ReactNode } from 'react';
import Sidebar, { type MenuItem } from '../Sidebar';

interface MainLayoutProps {
  children: ReactNode;
  menuItems: MenuItem[];
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
  currentUser?: {
    name: string | null;
    email: string | null;
    avatarUrl?: string | null;
  };
  onLogout?: () => void;
}

export function MainLayout({
  children,
  menuItems,
  selectedMenuItem,
  onMenuItemSelect,
  currentUser,
  onLogout,
}: MainLayoutProps) {
  return (
    <div className="h-screen bg-[var(--agyn-bg-light)] flex">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar 
          menuItems={menuItems}
          selectedMenuItem={selectedMenuItem} 
          currentUser={currentUser}
          onMenuItemSelect={onMenuItemSelect} 
          onLogout={onLogout}
        />
        <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
