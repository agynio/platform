import Sidebar, { type MenuItem } from '../Sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
  menuItems: MenuItem[];
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

export function MainLayout({
  children,
  menuItems,
  selectedMenuItem,
  onMenuItemSelect,
}: MainLayoutProps) {
  return (
    <div className="h-screen bg-[var(--agyn-bg-light)] flex">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar 
          menuItems={menuItems}
          selectedMenuItem={selectedMenuItem} 
          onMenuItemSelect={onMenuItemSelect} 
        />
        <div className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
